import { sql } from "@/lib/db/neon";

export type AccountDeletionUiState = "none" | "pending" | "confirmation" | "complete";

/** Status only: this projection never returns operation ids, provider state, or account data. */
export async function getAccountDeletionUiState(actorUserId: string): Promise<AccountDeletionUiState> {
  const rows = await sql`SELECT d.status,
    d.account_role='owner' AND NOT d.shared_workspace_confirmed AND EXISTS (
      SELECT 1 FROM public.businesses b WHERE b.owner_user_id=d.actor_user_id AND (
        EXISTS (SELECT 1 FROM public.business_members bm WHERE bm.business_id=b.id AND bm.user_id<>d.actor_user_id)
        OR EXISTS (SELECT 1 FROM public.team_invitations i WHERE i.business_id=b.id AND i.status='pending' AND i.expires_at>now())
      )
    ) AS confirmation_required
    FROM public.privacy_account_deletion_operations d WHERE d.actor_user_id=${actorUserId}::uuid LIMIT 1`;
  const status = rows[0] as { status?: string; confirmation_required?: boolean } | undefined;
  return status?.status === "complete" ? "complete"
    : status?.status === "frozen" ? (status.confirmation_required ? "confirmation" : "pending")
      : "none";
}
