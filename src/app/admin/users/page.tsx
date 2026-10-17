import { requireAdminPage } from "@/lib/guards";
import { getSessionUser } from "@/lib/session";
import { adminUsers } from "@/services/admin";
import { AdminPage } from "@/components/admin/page-bits";
import { RoleToggle } from "@/components/admin/role-toggle";
import { formatDate, fromISO } from "@/lib/time";
import { NO_SHOW_LIMIT } from "@/contracts";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const { q } = await searchParams;
  const [users, me] = await Promise.all([adminUsers(q), getSessionUser()]);
  return (
    <AdminPage title="Users" sub="Everyone who has logged in. Host access comes from host teams; superadmin access is granted here.">
      <form action="/admin/users" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Name or phone" className="h-11 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none focus:border-brand" />
        <button type="submit" className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white">
          Search
        </button>
      </form>
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-3 py-3 font-semibold">City</th>
              <th className="px-3 py-3 font-semibold">Bookings</th>
              <th className="px-3 py-3 font-semibold">No-shows</th>
              <th className="px-3 py-3 font-semibold">Host teams</th>
              <th className="px-3 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Superadmin</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{u.name ?? "Profile not set up"}</p>
                  <p className="text-xs text-muted">+91 {u.phone}</p>
                </td>
                <td className="px-3 py-3">{u.city}</td>
                <td className="px-3 py-3 tabular-nums">{u.bookings}</td>
                <td className="px-3 py-3 tabular-nums">
                  {u.noShows}
                  {u.noShows >= NO_SHOW_LIMIT && <span className="ml-1.5 rounded bg-danger-tint px-1 text-[10px] font-bold text-danger">NO CASH</span>}
                </td>
                <td className="px-3 py-3 text-ink-2">{u.hostRoles.join(", ") || "None"}</td>
                <td className="px-3 py-3 text-muted">{formatDate(fromISO(u.createdAt).ymd, true)}</td>
                <td className="px-4 py-3">
                  <RoleToggle id={u.id} admin={u.role === "admin"} self={u.id === me?.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
