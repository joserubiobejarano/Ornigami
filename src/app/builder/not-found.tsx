import Link from "next/link";

export default function BuilderNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5f5a4f]">
        Private beta
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
        This builder is not open
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#5f5a4f]">
        Builder-specific invite access, ownership and generation budgets are not
        implemented yet. A reputation account or plan does not grant access.
      </p>
      <p className="mt-3 text-sm leading-6 text-[#5f5a4f]">
        The development Campaign Lab remains available only while running the
        local development server.
      </p>
      <Link
        href="/"
        className="mt-6 w-fit text-sm font-semibold underline decoration-[#b8aa93] underline-offset-4 hover:text-[#1d2a22]"
      >
        Return to Ornigami
      </Link>
    </main>
  );
}
