import { trpc } from "@/lib/trpc";
import { Bot, Check, Clipboard, Download, FileText, Loader2, Mail, RefreshCw, Users, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AIChatBox, Message } from "./AIChatBox";

interface ChatPanelProps {
  dealId: number;
  dealName: string;
}

const SUGGESTED_PROMPTS = [
  "What items are still outstanding?",
  "Summarise the current deal status",
  "What conditions precedent remain unsatisfied?",
];

const QUICK_ACTIONS = [
  {
    label: "Full status update",
    icon: FileText,
    message: "Give me a full status update on this deal.",
  },
  {
    label: "What should I prioritise?",
    icon: Zap,
    message: "What should I prioritise to keep this deal on track for closing?",
  },
  {
    label: "Draft chaser email",
    icon: Mail,
    message: "I'd like to draft a chaser email. Which party would you like to chase? Please list the parties with outstanding or under review items so I can choose.",
  },
  {
    label: "Party summary",
    icon: Users,
    message: "I'd like a party summary. Which party would you like a summary for? Please list the parties involved in this deal.",
  },
];

export function ChatPanel({ dealId, dealName }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLatest = async () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    try {
      await navigator.clipboard.writeText(lastAssistant.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

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
  // Track the last user message so Regenerate can re-send it
  const lastUserMessageRef = useRef<string | null>(null);

  const { data: history, isLoading: historyLoading } = trpc.chat.history.useQuery(
    { dealId },
    { enabled: !!dealId }
  );

  // Sync history into local messages when deal changes
  useEffect(() => {
    if (history) {
      const mapped = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(mapped);
      // Restore lastUserMessageRef from history
      const lastUser = [...mapped].reverse().find((m) => m.role === "user");
      lastUserMessageRef.current = lastUser?.content ?? null;
    }
  }, [history, dealId]);

  const utils = trpc.useUtils();

  const applyStatusUpdate = (statusUpdate: { itemId: number; newStatus: string } | null) => {
    if (!statusUpdate) return;
    type ItemStatus = "Executed" | "Under Review" | "Outstanding" | "Waived";
    const typedStatus = statusUpdate.newStatus as ItemStatus;
    const now = Date.now();
    utils.deals.get.setData({ dealId }, (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((item) =>
          item.id === statusUpdate.itemId
            ? { ...item, status: typedStatus, statusChangedAt: now }
            : item
        ),
      };
    });
    utils.deals.get.invalidate({ dealId });
  };

  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
      applyStatusUpdate(data.statusUpdate);
    },
    onError: () => {
      toast.error("Clark failed to respond. Please try again.");
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  const handleSend = (content: string) => {
    lastUserMessageRef.current = content;
    setMessages((prev) => [...prev, { role: "user", content }]);
    sendMessage.mutate({ dealId, message: content });
  };

  // Regenerate: drop the last assistant reply and re-send the last user message
  const handleRegenerate = () => {
    const lastUserMsg = lastUserMessageRef.current;
    if (!lastUserMsg || sendMessage.isPending) return;
    // Remove the last assistant message from local state
    setMessages((prev) => {
      const copy = [...prev];
      // Walk backwards and remove the last assistant entry
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy.splice(i, 1);
          break;
        }
      }
      return copy;
    });
    sendMessage.mutate({ dealId, message: lastUserMsg });
  };

  // Show the regenerate button only when:
  // - there is at least one exchange (user + assistant)
  // - the last visible message is from the assistant
  // - not currently loading
  const lastMsg = messages[messages.length - 1];
  const canRegenerate =
    !sendMessage.isPending &&
    !!lastUserMessageRef.current &&
    !!lastMsg &&
    lastMsg.role === "assistant";

  if (historyLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <p className="text-sm">Loading conversation…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border shrink-0">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none">Clark</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Ask Clark anything about this deal.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
      </div>

      {/* Chat box — takes all remaining height */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={sendMessage.isPending}
            placeholder="Ask Clark about this deal…"
            height="100%"
            className="rounded-none border-0 shadow-none h-full"
            emptyStateMessage={`Ask Clark anything about "${dealName}"`}
            suggestedPrompts={SUGGESTED_PROMPTS}
          />
        </div>

        {/* Quick action buttons — always visible above input */}
        <div className="shrink-0 border-t border-border/50 bg-background/30 px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map(({ label, icon: Icon, message }) => (
              <button
                key={label}
                onClick={() => handleSend(message)}
                disabled={sendMessage.isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 hover:border-border rounded-full px-2.5 py-1 transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed bg-background"
              >
                <Icon className="w-3 h-3 shrink-0" />
                {label}
              </button>
            ))}
            {/* Copy latest response */}
            <button
              onClick={handleCopyLatest}
              disabled={sendMessage.isPending || !messages.some((m) => m.role === "assistant")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 hover:border-border rounded-full px-2.5 py-1 transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed bg-background"
              title="Copy latest response"
            >
              {copied ? (
                <Check className="w-3 h-3 shrink-0 text-emerald-500" />
              ) : (
                <Clipboard className="w-3 h-3 shrink-0" />
              )}
              {copied ? "Copied!" : "Copy response"}
            </button>
            {/* Export PDF — triggers browser download, not a chat message */}
            <button
              onClick={handleExportPdf}
              disabled={pdfLoading || sendMessage.isPending}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 hover:border-border rounded-full px-2.5 py-1 transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed bg-background"
            >
              {pdfLoading ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
              ) : (
                <Download className="w-3 h-3 shrink-0" />
              )}
              {pdfLoading ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        </div>

        {/* Regenerate button — sits just above the input area, inside the panel */}
        {canRegenerate && (
          <div className="flex justify-center px-4 py-1.5 border-t border-border/50 bg-background/30">
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2.5 py-1 hover:bg-accent"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate response
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
