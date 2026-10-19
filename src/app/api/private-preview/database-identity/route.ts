import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";
import { isPrivatePreviewMode } from "@/lib/private-preview";
import {
  runPrivatePreviewDatabaseIdentityRoute,
  withPrivatePreviewDatabaseIdentityDeadline,
} from "@/lib/private-preview-database-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response = await runPrivatePreviewDatabaseIdentityRoute({
    env: process.env,
    privatePreview: isPrivatePreviewMode(),
    authenticate: async () => {
      const session = await auth();
      return typeof session?.user?.id === "string" && session.user.id.length > 0;
    },
    queryIdentity: async () => withPrivatePreviewDatabaseIdentityDeadline(async () => {
      const rows = await sql`SELECT current_database() AS database_name, current_user AS role_name`;
      const row = rows[0] as { database_name?: unknown; role_name?: unknown } | undefined;
      if (!row) throw new Error("identity_row_missing");
      return { databaseName: row.database_name, roleName: row.role_name };
    }),
  });

  return NextResponse.json(response.body, { status: response.status, headers: response.headers });
}
