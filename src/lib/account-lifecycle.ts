import { sql } from "@/lib/db/neon";

export type LifecycleAdmission = { result: "claimed" | "busy" | "frozen" | "uncertain" | "done" | "failed"; token: string | null };

export async function beginAccountLifecycleOperation(input: {
  userId: string;
  actorUserId?: string | null;
  businessId?: string | null;
  kind: string;
  idempotencyKey: string;
  leaseMs?: number;
}): Promise<LifecycleAdmission> {
  const rows = await sql`SELECT * FROM public.begin_account_lifecycle_operation(
    ${input.userId}::uuid,${input.actorUserId ?? null}::uuid,${input.businessId ?? null}::uuid,
    ${input.kind},${input.idempotencyKey},${input.leaseMs ?? 30000})`;
  const row = rows[0] as { result?: string; token?: string | null } | undefined;
  const result = row?.result;
  return {
    result: result === "claimed" || result === "busy" || result === "frozen" || result === "uncertain" || result === "done" || result === "failed" ? result : "frozen",
    token: row?.token ?? null,
  };
}

export async function finishAccountLifecycleOperation(token: string, outcome: "done" | "uncertain" | "failed"): Promise<boolean> {
  const rows = await sql`SELECT public.finish_account_lifecycle_operation(${token}::uuid,${outcome}) AS changed`;
  return (rows[0] as { changed?: boolean } | undefined)?.changed === true;
}
