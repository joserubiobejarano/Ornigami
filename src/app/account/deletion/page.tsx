import { redirect } from "next/navigation";

import { auth } from "@/auth";
import AccountDeletionForm from "./deletion-form";
import { getAccountDeletionUiState } from "@/lib/account-deletion-recovery";

export const dynamic = "force-dynamic";

export default async function AccountDeletionPage() {
  const session = await auth();
  const userId = session?.user?.id || session?.deletionUserId;
  if (!userId) redirect("/login?callbackUrl=%2Faccount%2Fdeletion");

  const initialState = await getAccountDeletionUiState(userId);
  return <AccountDeletionForm initialState={initialState} />;
}
