import { sql } from "@/lib/db/neon";

export type DeletionRole = "owner" | "member";
export type DeletionClaim = {
  result: "claimed" | "busy" | "complete" | "not_found";
  actorUserId: string | null;
  accountRole: DeletionRole | null;
  fence: string | null;
};

export async function beginAccountDeletion(actorUserId: string, confirmSharedWorkspaceData: boolean) {
  const rows = await sql`
    SELECT * FROM public.privacy_begin_account_deletion(
      ${actorUserId}::uuid, ${confirmSharedWorkspaceData}
    )
  `;
  const row = rows[0] as { result?: string; operation_id?: string | null; account_role?: string | null } | undefined;
  return {
    result: row?.result ?? "unavailable",
    operationId: row?.operation_id ?? null,
    accountRole: row?.account_role === "owner" || row?.account_role === "member" ? row.account_role : null,
  };
}

export async function claimAccountDeletion(operationId: string): Promise<DeletionClaim> {
  const rows = await sql`SELECT * FROM public.privacy_claim_account_deletion(${operationId}::uuid, 300000)`;
  const row = rows[0] as { result?: string; actor_user_id?: string | null; account_role?: string | null; fence?: string | null } | undefined;
  const result = row?.result;
  return {
    result: result === "claimed" || result === "busy" || result === "complete" ? result : "not_found",
    actorUserId: row?.actor_user_id ?? null,
    accountRole: row?.account_role === "owner" || row?.account_role === "member" ? row.account_role : null,
    fence: row?.fence ?? null,
  };
}

export async function getAccountDeletionSteps(operationId: string) {
  const rows = await sql`
    SELECT billing_complete, google_complete FROM public.privacy_account_deletion_operations
    WHERE id=${operationId}::uuid AND status='frozen'
  `;
  const row = rows[0] as { billing_complete?: boolean; google_complete?: boolean } | undefined;
  if (!row) throw new Error("privacy_deletion_operation_missing");
  return { billing: row.billing_complete === true, google: row.google_complete === true };
}

export async function recordAccountDeletionStep(operationId: string, fence: string, step: "billing" | "google"): Promise<void> {
  const rows = await sql`SELECT public.privacy_record_account_deletion_step(${operationId}::uuid,${fence}::uuid,${step}) AS changed`;
  if ((rows[0] as { changed?: boolean } | undefined)?.changed !== true) throw new Error("privacy_deletion_stale_fence");
}

export async function releaseAccountDeletion(operationId: string, fence: string, errorCode: string): Promise<void> {
  await sql`SELECT public.privacy_release_account_deletion(${operationId}::uuid,${fence}::uuid,${errorCode})`;
}

export async function renewAccountDeletionLease(operationId: string, fence: string): Promise<void> {
  const rows = await sql`SELECT public.privacy_renew_account_deletion(${operationId}::uuid,${fence}::uuid,300000) AS renewed`;
  if ((rows[0] as { renewed?: boolean } | undefined)?.renewed !== true) throw new Error("privacy_deletion_stale_fence");
}

export async function getFrozenDeletionOperation(actorUserId: string): Promise<string | null> {
  const rows = await sql`SELECT id FROM public.privacy_account_deletion_operations WHERE actor_user_id=${actorUserId}::uuid AND status='frozen'`;
  return (rows[0] as { id?: string } | undefined)?.id ?? null;
}

export async function finalizeAccountDeletion(operationId: string, fence: string): Promise<string> {
  const rows = await sql`SELECT public.privacy_finalize_account_deletion(${operationId}::uuid,${fence}::uuid) AS result`;
  return String((rows[0] as { result?: unknown } | undefined)?.result ?? "unavailable");
}
