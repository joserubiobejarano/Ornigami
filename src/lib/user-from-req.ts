import { auth } from "@/auth";

export type ResolvedUser =
  | { id: string; email?: string | null; demo?: false }
  | { demo: true; id: string };

/**
 * Resolve the current user for API routes: middleware-controlled demo header, then Auth.js session.
 */
export async function resolveUser(req: Request): Promise<ResolvedUser | null> {
  if (req.headers.get("x-demo") === "true") {
    return { demo: true, id: "demo-user" };
  }

  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      email: session.user.email,
      demo: false,
    };
  }

  return null;
}
