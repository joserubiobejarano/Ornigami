import Link from "next/link";

export function BuilderClosedNotice({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5f5a4f]">
        Private beta
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
        {unavailable ? "Builder access is unavailable" : "This builder is not open"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#5f5a4f]">
        {unavailable
          ? "The builder identity store or runtime configuration is unavailable. Access remains closed until the operator restores it."
          : "Invitation access is disabled in this deployment. A legacy Ornigami account, plan or password does not grant builder access."}
      </p>
      <p className="mt-3 text-sm leading-6 text-[#5f5a4f]">
        This runtime contains only the builder. Legacy marketing, account,
        billing, provider, webhook and job routes are not part of it.
      </p>
      <Link
        href="/"
        className="mt-6 w-fit text-sm font-semibold underline decoration-[#b8aa93] underline-offset-4 hover:text-[#1d2a22]"
      >
        Return to builder home
      </Link>
    </main>
  );
}
