import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Trash2,
  Crown,
  Loader2,
  Clock,
  Mail,
} from "lucide-react";

type MemberRole = "admin" | "editor" | "viewer";

const ROLE_LABELS: Record<MemberRole | "owner", { label: string; description: string; color: string }> = {
  owner: { label: "Owner", description: "Full access, cannot be removed", color: "bg-amber-100 text-amber-800 border-amber-200" },
  admin: { label: "Admin", description: "Full access, can invite & remove members", color: "bg-blue-100 text-blue-800 border-blue-200" },
  editor: { label: "Editor", description: "Can update statuses and upload documents", color: "bg-green-100 text-green-800 border-green-200" },
  viewer: { label: "Viewer", description: "Read-only access and PDF export", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

function RoleBadge({ role }: { role: MemberRole | "owner" }) {
  const cfg = ROLE_LABELS[role] ?? ROLE_LABELS.viewer;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {role === "owner" && <Crown className="w-3 h-3 mr-1" />}
      {cfg.label}
    </span>
  );
}

function formatLastAccess(ts: string | null | undefined): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  dealId: number;
}

export function MembersPanel({ dealId }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.members.list.useQuery({ dealId });
  const { data: myRoleData } = trpc.members.myRole.useQuery({ dealId });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("viewer");
  const [inviting, setInviting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMutation = trpc.members.invite.useMutation({
    onSuccess: (result) => {
      setGeneratedLink(result.inviteUrl);
      setInviteEmail("");
      utils.members.list.invalidate({ dealId });
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to create invite");
    },
  });

  const removeMutation = trpc.members.remove.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate({ dealId });
      toast.success("Member removed");
    },
    onError: (err) => toast.error(err.message ?? "Failed to remove member"),
  });

  const updateRoleMutation = trpc.members.updateRole.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate({ dealId });
      toast.success("Role updated");
    },
    onError: (err) => toast.error(err.message ?? "Failed to update role"),
  });

  const canManage = myRoleData?.isOwner || myRoleData?.role === "admin";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteMutation.mutateAsync({
        dealId,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        origin: window.location.origin,
      });
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const members = data?.members ?? [];
  const ownerId = data?.ownerId;

  // Find the owner user record from the users table (we only have their userId here)
  // We'll show the current user's info if they're the owner, otherwise just show "Owner"
  const ownerEntry = {
    id: -1,
    name: ownerId === user?.id ? (user?.name ?? "You") : "Deal Owner",
    email: ownerId === user?.id ? (user?.email ?? "") : "",
    memberRole: "owner" as const,
    inviteStatus: "accepted" as const,
    lastAccessedAt: null as string | null,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Deal Team</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {members.filter((m) => m.inviteStatus === "accepted").length + 1} active
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Invite form — only for admins/owners */}
        {canManage && (
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" />
              Invite a colleague
            </p>
            <form onSubmit={handleInvite} className="space-y-2">
              <Input
                type="email"
                placeholder="colleague@firm.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="text-xs h-8"
                required
              />
              <div className="flex gap-2">
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <span className="font-medium">Admin</span>
                      <span className="text-muted-foreground ml-1 text-xs">— full access</span>
                    </SelectItem>
                    <SelectItem value="editor">
                      <span className="font-medium">Editor</span>
                      <span className="text-muted-foreground ml-1 text-xs">— update & upload</span>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <span className="font-medium">Viewer</span>
                      <span className="text-muted-foreground ml-1 text-xs">— read only</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm" className="h-8 text-xs px-3" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate link"}
                </Button>
              </div>
            </form>

            {/* Generated invite link */}
            {generatedLink && (
              <div className="mt-3 p-2.5 rounded-md bg-primary/5 border border-primary/20">
                <p className="text-xs font-medium text-foreground mb-1.5">Invite link generated</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Share this link with your colleague. They will need to sign in with Manus to accept.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-background rounded px-2 py-1 border border-border truncate text-muted-foreground">
                    {generatedLink}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 shrink-0"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <button
                  className="mt-1.5 text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setGeneratedLink(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Owner row */}
            <MemberRow
              key="owner"
              id={-1}
              name={ownerEntry.name}
              email={ownerEntry.email}
              role="owner"
              status="accepted"
              lastAccessedAt={null}
              isCurrentUser={ownerId === user?.id}
              canManage={false}
              dealId={dealId}
              onRemove={() => {}}
              onRoleChange={() => {}}
            />

            {/* Invited members */}
            {members.map((m) => (
              <MemberRow
                key={m.id}
                id={m.id}
                name={m.name ?? m.email}
                email={m.email}
                role={m.memberRole as MemberRole}
                status={m.inviteStatus}
                lastAccessedAt={m.lastAccessedAt ?? null}
                isCurrentUser={m.userId === user?.id}
                canManage={canManage && m.userId !== ownerId}
                dealId={dealId}
                onRemove={() => removeMutation.mutate({ dealId, memberId: m.id })}
                onRoleChange={(role) => updateRoleMutation.mutate({ dealId, memberId: m.id, role })}
              />
            ))}

            {members.length === 0 && (
              <div className="px-4 py-6 text-center">
                <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No team members yet.</p>
                {canManage && (
                  <p className="text-xs text-muted-foreground mt-1">Use the form above to invite colleagues.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface MemberRowProps {
  id: number;
  name: string;
  email: string;
  role: MemberRole | "owner";
  status: "pending" | "accepted";
  lastAccessedAt: string | null;
  isCurrentUser: boolean;
  canManage: boolean;
  dealId: number;
  onRemove: () => void;
  onRoleChange: (role: MemberRole) => void;
}

function MemberRow({
  name,
  email,
  role,
  status,
  lastAccessedAt,
  isCurrentUser,
  canManage,
  onRemove,
  onRoleChange,
}: MemberRowProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="px-4 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
        {status === "pending" ? <Mail className="w-3.5 h-3.5 text-muted-foreground" /> : initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">
            {name}
            {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
          </span>
          {status === "pending" && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-600 border-amber-300 bg-amber-50">
              Pending
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{email}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {canManage && role !== "owner" ? (
            <Select
              value={role}
              onValueChange={(v) => onRoleChange(v as MemberRole)}
            >
              <SelectTrigger className="h-5 text-xs px-1.5 py-0 w-auto border-0 bg-transparent hover:bg-accent rounded gap-1 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <RoleBadge role={role} />
          )}
          {status === "accepted" && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {formatLastAccess(lastAccessedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Remove button */}
      {canManage && role !== "owner" && (
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors shrink-0 mt-0.5"
          title="Remove member"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
