import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";
import { withDatabaseDeadline } from "@/lib/db/deadline";
import { isPrivatePreviewMode } from "@/lib/private-preview";
import {
  checkPrivatePreviewDatabaseIdentity,
  PRIVATE_PREVIEW_DB_IDENTITY_TIMEOUT_MS,
} from "@/lib/private-preview-database-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseStatus: Record<Awaited<ReturnType<typeof checkPrivatePreviewDatabaseIdentity>>, number> = {
  verified: 200,
  not_private_preview: 404,
  unauthorized: 401,
  configuration_invalid: 503,
  identity_mismatch: 503,
  verification_failed: 503,
};

export async function GET() {
  const status = await checkPrivatePreviewDatabaseIdentity({
    env: process.env,
    privatePreview: isPrivatePreviewMode(),
    authenticate: async () => {
      const session = await auth();
      return typeof session?.user?.id === "string" && session.user.id.length > 0;
    },
    queryIdentity: async () => withDatabaseDeadline(
      Date.now() + PRIVATE_PREVIEW_DB_IDENTITY_TIMEOUT_MS,
      async () => {
        const rows = await sql`SELECT current_database() AS database_name, current_user AS role_name`;
        const row = rows[0] as { database_name?: unknown; role_name?: unknown } | undefined;
        if (!row) throw new Error("identity_row_missing");
        return { databaseName: row.database_name, roleName: row.role_name };
      },
    ),
  });

  return NextResponse.json({ status }, {
    status: responseStatus[status],
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
