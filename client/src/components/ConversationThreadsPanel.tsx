import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Check,
  Edit2,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export type ConversationThreadsPanelProps = {
  dealId: number;
  dealName?: string;
  height?: string | number;
  className?: string;
  onStatusChange?: (update: { itemId: number; newStatus: string }) => void;
};

export function ConversationThreadsPanel({
  dealId,
  dealName = "Deal",
  height = "600px",
  className,
  onStatusChange,
}: ConversationThreadsPanelProps) {
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [editingThreadId, setEditingThreadId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await fetch(`/api/deals/${dealId}/export-pdf`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dealName.replace(/[^a-z0-9]/gi, "_")}_Checklist.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Checklist exported successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setPdfLoading(false);
    }
  };
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Queries
  const threadsQuery = trpc.threads.list.useQuery({ dealId });
  const messagesQuery = trpc.threads.messages.useQuery(
    { threadId: activeThreadId ?? 0 },
    { enabled: !!activeThreadId }
  );

  // Mutations
  const createThreadMutation = trpc.threads.create.useMutation({
    onSuccess: (data) => {
      setActiveThreadId(data.threadId);
      setSidebarOpen(false);
      threadsQuery.refetch();
      toast.success("New conversation started");
    },
    onError: () => {
      toast.error("Failed to create conversation");
    },
  });

  const sendMessageMutation = trpc.threads.sendMessage.useMutation({
    onSuccess: (data) => {
      setInput("");
      messagesQuery.refetch();
      threadsQuery.refetch(); // refresh sidebar to pick up auto-generated title
      setTimeout(() => scrollToBottom(), 100);
      textareaRef.current?.focus();
      // Optimistic UI: immediately update checklist item status if Clark changed one
      if (data.statusUpdate && onStatusChange) {
        onStatusChange(data.statusUpdate);
      }
    },
    onError: () => {
      toast.error("Failed to send message");
    },
  });

  const updateTitleMutation = trpc.threads.updateTitle.useMutation({
    onSuccess: () => {
      setEditingThreadId(null);
      threadsQuery.refetch();
    },
    onError: () => {
      toast.error("Failed to update title");
    },
  });

  const deleteThreadMutation = trpc.threads.delete.useMutation({
    onSuccess: (_, variables) => {
      if (activeThreadId === variables.threadId) {
        const remaining = (threadsQuery.data ?? []).filter(
          (t) => t.id !== variables.threadId
        );
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      }
      threadsQuery.refetch();
      toast.success("Conversation deleted");
    },
    onError: () => {
      toast.error("Failed to delete conversation");
    },
  });

  // Auto-select first thread on load
  useEffect(() => {
    if (threadsQuery.data && threadsQuery.data.length > 0 && !activeThreadId) {
      setActiveThreadId(threadsQuery.data[0].id);
    }
  }, [threadsQuery.data, activeThreadId]);

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  };

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messagesQuery.data, sendMessageMutation.isPending]);

  const handleCreateThread = () => {
    createThreadMutation.mutate({ dealId });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !activeThreadId || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate({ dealId, threadId: activeThreadId, message: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleSelectThread = (id: number) => {
    setActiveThreadId(id);
    setSidebarOpen(false);
  };

  const handleUpdateTitle = (threadId: number) => {
    if (!editingTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    updateTitleMutation.mutate({ dealId, threadId, title: editingTitle });
  };

  const handleDeleteThread = (threadId: number) => {
    if (confirm("Delete this conversation? This cannot be undone.")) {
      deleteThreadMutation.mutate({ dealId, threadId });
    }
  };

  const currentThread = threadsQuery.data?.find((t) => t.id === activeThreadId);
  const messages = messagesQuery.data ?? [];

  return (
    <div
      className={cn("flex flex-col bg-background overflow-hidden", className)}
      style={{ height }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        {/* History toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? "Hide history" : "Show conversation history"}
          className={cn(
            "p-1.5 rounded transition-colors",
            sidebarOpen
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <History className="size-4" />
        </button>

        {/* Current thread title */}
        <span className="flex-1 text-sm font-medium truncate text-foreground">
          {currentThread?.title ?? (activeThreadId ? "New Conversation" : "Clark")}
        </span>

        {/* New conversation button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCreateThread}
          disabled={createThreadMutation.isPending}
          className="gap-1.5 h-7 px-2 text-xs shrink-0"
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </div>

      {/* ── Body: sidebar overlay + chat ──────────────────────────────── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Collapsible sidebar — overlays the chat area */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 z-20 w-64 max-sm:w-[min(16rem,calc(100vw-1rem))] flex flex-col bg-background border-r shadow-lg transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Conversations
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-2">
              {threadsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : threadsQuery.data && threadsQuery.data.length > 0 ? (
                threadsQuery.data.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "group relative rounded-lg border p-2.5 cursor-pointer transition-colors",
                      activeThreadId === thread.id
                        ? "bg-primary/10 border-primary/40"
                        : "border-transparent hover:bg-muted"
                    )}
                    onClick={() => handleSelectThread(thread.id)}
                  >
                    {editingThreadId === thread.id ? (
                      <div
                        className="flex gap-1 items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateTitle(thread.id);
                            if (e.key === "Escape") setEditingThreadId(null);
                          }}
                          className="flex-1 px-2 py-0.5 text-xs border rounded bg-background"
                          autoFocus
                        />
                        <button
                          onClick={() => handleUpdateTitle(thread.id)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <Check className="size-3 text-green-600" />
                        </button>
                        <button
                          onClick={() => setEditingThreadId(null)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <X className="size-3 text-destructive" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1">
                        {/* Title + date — takes all remaining width */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {thread.title ?? "New Conversation"}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(thread.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {/* Action buttons — always visible, never clipped */}
                        <div className="flex gap-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingThreadId(thread.id);
                              setEditingTitle(thread.title ?? "");
                            }}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <Edit2 className="size-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteThread(thread.id);
                            }}
                            className="p-1 hover:bg-destructive/20 rounded"
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No conversations yet
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Backdrop to close sidebar on click outside */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-10 bg-black/10"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Chat content — always full width ───────────────────────── */}
        <div className="flex flex-col h-full min-h-0">
          {activeThreadId ? (
            <>
              {/* Messages area */}
              <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-hidden">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground p-6">
                    <Sparkles className="size-10 opacity-20" />
                    <p className="text-sm">Start a conversation with Clark</p>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="flex flex-col space-y-4 p-4">
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex gap-3",
                            message.role === "user"
                              ? "justify-end items-start"
                              : "justify-start items-start"
                          )}
                        >
                          {message.role === "assistant" && (
                            <div className="size-7 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                              <Sparkles className="size-3.5 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[85%] rounded-lg px-3.5 py-2.5",
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                            )}
                          >
                            {message.role === "assistant" ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <Streamdown>{message.content}</Streamdown>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm">
                                {message.content}
                              </p>
                            )}
                          </div>
                          {message.role === "user" && (
                            <div className="size-7 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                              <User className="size-3.5 text-secondary-foreground" />
                            </div>
                          )}
                        </div>
                      ))}

                      {sendMessageMutation.isPending && (
                        <div className="flex items-start gap-3">
                          <div className="size-7 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                            <Sparkles className="size-3.5 text-primary" />
                          </div>
                          <div className="rounded-lg bg-muted px-3.5 py-2.5">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-1 px-2 sm:px-3 pt-2 pb-1 shrink-0">
                {([] as string[]).map((label) => (
                  <button
                    key={label}
                    type="button"
                    disabled={sendMessageMutation.isPending}
                    onClick={() => {
                      if (sendMessageMutation.isPending) return;
                      setInput("");
                      sendMessageMutation.mutate({
                        dealId,
                        threadId: activeThreadId!,
                        message: label,
                      });
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {label}
                  </button>
                ))}
                {/* Export PDF — triggers direct download, not a Clark message */}
                <button
                  type="button"
                  disabled={pdfLoading}
                  onClick={handleExportPdf}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {pdfLoading ? "Exporting…" : "Export PDF"}
                </button>
              </div>

              {/* Input */}
              <form
                onSubmit={handleSendMessage}
                className="flex gap-2 p-2 sm:p-3 pt-1 border-t bg-background/50 items-end shrink-0"
              >
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Clark about the deal..."
                  className="flex-1 max-h-28 resize-none min-h-9"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || sendMessageMutation.isPending}
                  className="shrink-0 h-9 w-9"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Sparkles className="size-10 opacity-20 mx-auto mb-3" />
                <p className="text-sm mb-4">No conversation selected</p>
                <Button onClick={handleCreateThread} variant="outline" size="sm">
                  Start a new conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
