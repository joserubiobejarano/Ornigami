import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const [{ createDashboardUser }, { hashPassword }] = await Promise.all([
    import("@/server/db/repositories/dashboard-users.repo"),
    import("@/server/auth/password"),
  ]);
  const email = process.env.INTERNAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INTERNAL_ADMIN_PASSWORD;
  const fullName = process.env.INTERNAL_ADMIN_NAME?.trim() || "Ornigami Internal Admin";
  if (!email || !password) throw new Error("Set INTERNAL_ADMIN_EMAIL and INTERNAL_ADMIN_PASSWORD before running this command.");
  if (password.length < 16) throw new Error("INTERNAL_ADMIN_PASSWORD must be at least 16 characters.");
  const user = await createDashboardUser({
    fullName,
    email,
    passwordHash: await hashPassword(password),
    businessId: null,
    role: "internal_admin",
  });
  console.info(`Created internal admin ${user.email}. Remove the bootstrap environment variables after use.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
