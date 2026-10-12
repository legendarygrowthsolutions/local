import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "./session";

/**
 * Page-level guards. Layouts redirect too, but a layout isn't re-run on every navigation, so each
 * protected page checks for itself (the session lookup is cached per request).
 */
export async function requireUserPage(path: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  return user;
}

export async function requireAdminPage() {
  const user = await requireUserPage("/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}
