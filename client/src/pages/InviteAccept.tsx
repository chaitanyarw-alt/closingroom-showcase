import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Users } from "lucide-react";
import { CRLogo } from "@/components/CRLogo";

export default function InviteAccept() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Look up the invite (public — works before login)
  const { data: invite, isLoading: inviteLoading, error: inviteError } = trpc.members.getInvite.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.members.acceptInvite.useMutation({
    onSuccess: (result) => {
      setAccepted(true);
      setTimeout(() => navigate(`/deal/${result.dealId}`), 1500);
    },
    onError: (err) => {
      setAcceptError(err.message ?? "Failed to accept invite");
    },
  });

  // Auto-accept once the user is logged in and we have the invite
  useEffect(() => {
    if (isAuthenticated && invite && invite.inviteStatus === "pending" && !accepted && !acceptError) {
      acceptMutation.mutate({ token });
    }
  }, [isAuthenticated, invite, accepted, acceptError, token]);

  // If already accepted, redirect to the deal
  useEffect(() => {
    if (isAuthenticated && invite && invite.inviteStatus === "accepted") {
      navigate(`/deal/${invite.dealId}`);
    }
  }, [isAuthenticated, invite]);

  const loginUrl = getLoginUrl(`/invite/${token}`);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <CRLogo className="h-8" />
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-8 text-center">
          {/* Loading states */}
          {(authLoading || inviteLoading) && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading invite…</p>
            </div>
          )}

          {/* Invite not found */}
          {!inviteLoading && inviteError && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="w-10 h-10 text-destructive" />
              <h2 className="text-lg font-semibold text-foreground">Invite not found</h2>
              <p className="text-sm text-muted-foreground">
                This invite link is invalid or has already been used.
              </p>
              <Button onClick={() => navigate("/")} className="mt-2">
                Go to ClosingRoom
              </Button>
            </div>
          )}

          {/* Invite found — not logged in */}
          {!inviteLoading && !inviteError && invite && !isAuthenticated && !authLoading && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">You've been invited</h2>
                <p className="text-sm text-muted-foreground">
                  You've been invited to join a deal as{" "}
                  <span className="font-medium text-foreground capitalize">{invite.role}</span>.
                </p>
                {invite.email && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Invite sent to: <span className="font-medium">{invite.email}</span>
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Sign in with your Manus account to accept this invitation.
              </p>
              <Button asChild className="w-full">
                <a href={loginUrl}>Sign in to accept</a>
              </Button>
            </div>
          )}

          {/* Accepting */}
          {isAuthenticated && invite && !accepted && !acceptError && acceptMutation.isPending && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Accepting invite…</p>
            </div>
          )}

          {/* Accepted */}
          {accepted && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-10 h-10 text-green-600" />
              <h2 className="text-lg font-semibold text-foreground">Invite accepted!</h2>
              <p className="text-sm text-muted-foreground">Redirecting you to the deal…</p>
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Accept error */}
          {acceptError && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="w-10 h-10 text-destructive" />
              <h2 className="text-lg font-semibold text-foreground">Could not accept invite</h2>
              <p className="text-sm text-muted-foreground">{acceptError}</p>
              <Button onClick={() => navigate("/")} className="mt-2">
                Go to ClosingRoom
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
