import { requireAdminPage } from "@/lib/guards";
import Link from "next/link";
import { adminBookings } from "@/services/admin";
import { AdminPage } from "@/components/admin/page-bits";
import { BookingStatusPill } from "@/components/host/bits";
import { RefundButton } from "@/components/admin/refund-button";
import { EmptyState } from "@/components/ui/states";
import { formatINR } from "@/lib/pricing";
import { formatWhen } from "@/lib/time";

export const metadata = { title: "Bookings & refunds" };

const STATUSES = [
  ["", "All statuses"],
  ["confirmed", "Confirmed"],
  ["checked_in", "Checked in"],
  ["requested", "Requested"],
  ["cancelled", "Cancelled"],
  ["refunded", "Refunded"],
];

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; city?: string; page?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const data = await adminBookings({ q: sp.q, status: sp.status || undefined, cityId: sp.city || undefined, page: Number(sp.page ?? 1) });
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (sp.status) u.set("status", sp.status);
    if (sp.city) u.set("city", sp.city);
    u.set("page", String(p));
    return `/admin/bookings?${u}`;
  };
  return (
    <AdminPage title="Bookings & refunds" sub="Find any booking by code, phone, name or listing. Support can cancel with a full, half or no refund of the ticket value." wide>
      <form className="flex flex-wrap gap-2" action="/admin/bookings">
        <input name="q" defaultValue={sp.q} placeholder="Code, phone, name or listing" className="h-11 min-w-56 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none focus:border-brand" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold" aria-label="Status">
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="city" defaultValue={sp.city ?? ""} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold" aria-label="City">
          <option value="">All cities</option>
          {data.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white">
          Search
        </button>
      </form>
      <p className="text-sm text-muted">{data.total.toLocaleString("en-IN")} bookings</p>
      {data.items.length === 0 ? (
        <EmptyState title="No bookings match" />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-semibold">Booking</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">When</th>
                <th className="px-3 py-3 font-semibold">Ticket value</th>
                <th className="px-3 py-3 font-semibold">Fees</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="max-w-72 px-4 py-3">
                    <p className="truncate font-semibold">{b.title}</p>
                    <p className="truncate text-xs text-muted">
                      <span className="font-mono">{b.code}</span> · {b.venueName} · {b.city}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{b.customer}</p>
                    <p className="text-xs text-muted">+91 {b.phone}</p>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{formatWhen(b.startsAt)}</td>
                  <td className="px-3 py-3 tabular-nums">{formatINR(b.ticketValue, { free: "Free" })}</td>
                  <td className="px-3 py-3 tabular-nums text-muted">{b.fees ? formatINR(b.fees) : "—"}</td>
                  <td className="px-3 py-3">
                    <BookingStatusPill status={b.status} />
                  </td>
                  <td className="px-4 py-3 text-right">{["confirmed", "requested", "checked_in"].includes(b.status) && <RefundButton id={b.id} code={b.code} ticketValue={b.ticketValue} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.pages > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
          {data.page > 1 && (
            <Link href={qs(data.page - 1)} className="rounded-lg border border-line-strong px-3 py-1.5 font-semibold">
              ← Previous
            </Link>
          )}
          <span className="text-muted">
            Page {data.page} of {data.pages}
          </span>
          {data.page < data.pages && (
            <Link href={qs(data.page + 1)} className="rounded-lg border border-line-strong px-3 py-1.5 font-semibold">
              Next →
            </Link>
          )}
        </nav>
      )}
    </AdminPage>
  );
}
