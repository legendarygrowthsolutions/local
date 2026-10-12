import "server-only";
import type { Listing, Session, TicketType } from "@/contracts";
import { repo } from "@/repositories";
import { hash01 } from "@/mocks/occupancy";

export const UNLIMITED = 9999;

export interface ListingInventory {
  sessions: (Session & { remaining: number })[];
  upcoming: (Session & { remaining: number })[];
  tickets: (TicketType & { remaining: number })[];
}

/** Remaining seats per session and per ticket type, after fixtures' "sold" and live bookings. */
export async function loadInventory(listings: Listing[], now = new Date()): Promise<Map<string, ListingInventory>> {
  const ids = listings.map((l) => l.id);
  const [sessions, tickets, active] = await Promise.all([
    repo.listings.sessions(ids),
    repo.listings.ticketTypes(ids),
    repo.bookings.activeQuantities(ids),
  ]);
  const out = new Map<string, ListingInventory>();
  for (const l of listings) {
    const lt = tickets
      .filter((t) => t.listingId === l.id)
      .map((t) => ({
        ...t,
        remaining: t.qty >= UNLIMITED ? UNLIMITED : Math.max(0, t.qty - t.sold - (active.byTicket.get(t.id) ?? 0)),
      }));
    const ticketsCarryInventory = lt.some((t) => t.qty < UNLIMITED);
    const ls = sessions
      .filter((s) => s.listingId === l.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((s) => {
        let remaining: number;
        if (s.capacity === 0) remaining = 0;
        else if (ticketsCarryInventory) {
          remaining = lt
            .filter((t) => !t.isPass && (t.sessionId === null || t.sessionId === s.id))
            .reduce((sum, t) => sum + t.remaining, 0);
        } else {
          const seeded = Math.floor(hash01(s.id) * s.capacity * 0.9);
          remaining = Math.max(0, s.capacity - seeded - (active.bySession.get(s.id) ?? 0));
        }
        return { ...s, remaining };
      });
    out.set(l.id, {
      sessions: ls,
      upcoming: ls.filter((s) => new Date(s.endsAt).getTime() > now.getTime()),
      tickets: lt,
    });
  }
  return out;
}
