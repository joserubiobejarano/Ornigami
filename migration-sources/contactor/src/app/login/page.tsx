import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { getOwnerDashboardSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getOwnerDashboardSession();

  if (session) {
    redirect(session.role === "internal_admin" ? "/admin" : "/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Speed-to-Lead Agent
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Owner login</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign in to access your business dashboard.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}

