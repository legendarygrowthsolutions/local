"use client";

import { QRCodeSVG } from "qrcode.react";
import { CalendarPlus, Download, MapPin, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { BookingView } from "@/services/bookings";
import { formatDate, formatMins, formatRange, fromISO } from "@/lib/time";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-free-tint text-free" },
  requested: { label: "Awaiting host approval", cls: "bg-warn-tint text-warn" },
  checked_in: { label: "Checked in", cls: "bg-field text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-field text-muted" },
  refunded: { label: "Refunded", cls: "bg-field text-muted" },
};

function icsFor(b: BookingView) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//local.//booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.id}@local`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(b.startsAt)}`,
    `DTEND:${fmt(b.endsAt)}`,
    `SUMMARY:${b.title}`,
    `LOCATION:${b.venueName}`,
    `DESCRIPTION:Booking ${b.code}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Wireframe 14 ticket: dark title band, key facts, perforation, QR with booking ID. */
export function TicketCard({ booking, className }: { booking: BookingView; className?: string }) {
  const s = STATUS[booking.status] ?? STATUS.confirmed;
  const inactive = booking.status === "cancelled" || booking.status === "refunded";
  const endYmd = fromISO(booking.endsAt).ymd;
  const multiDay = endYmd !== booking.dateYmd;
  const venue = booking.kind === "venue";
  return (
    <article className={cn("overflow-hidden rounded-[22px] border border-line bg-surface", className)} aria-label={`Ticket for ${booking.title}`}>
      <div className="flex items-start justify-between gap-3 bg-feature px-[18px] py-4 text-white">
        <h2 className="min-w-0 font-display text-[19px] font-extrabold leading-[1.15]">{booking.title}</h2>
        {booking.status !== "confirmed" && <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", s.cls)}>{s.label}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-3 px-[18px] py-4">
        <Kv label="Date" value={multiDay ? `${formatDate(booking.dateYmd).split(", ")[1]} – ${formatDate(endYmd).split(", ")[1]}` : formatDate(booking.dateYmd)} />
        <Kv label={venue ? "Time" : "Entry"} value={venue ? formatRange(booking.startsAt, booking.endsAt) : formatMins(fromISO(booking.startsAt).mins)} />
        <Kv label={venue ? "Court" : "Tickets"} value={booking.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.label}`).join(", ")} />
        <Kv label="Venue" value={booking.venueName} />
      </dl>
      <div className="flex h-5 items-center" aria-hidden>
        <span className="-ml-[11px] size-[22px] flex-none rounded-full border border-line bg-ground" />
        <span className="flex-1 border-t-2 border-dashed border-line-strong" />
        <span className="-mr-[11px] size-[22px] flex-none rounded-full border border-line bg-ground" />
      </div>
      <div className="flex flex-col items-center gap-2 px-[18px] pb-[18px] pt-3.5">
        <div className={cn("rounded-[14px] bg-ink p-2.5", inactive && "opacity-30")}>
          <QRCodeSVG value={`LOCAL:${booking.code}`} size={116} fgColor="#FFFFFF" bgColor="#14121F" level="M" aria-label={`QR code for booking ${booking.code}`} />
        </div>
        <span className="text-xs font-bold tracking-[0.08em] text-muted">BOOKING ID · {booking.code}</span>
      </div>
    </article>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</dt>
      <dd className="text-sm font-bold">{value}</dd>
    </div>
  );
}

export function TicketActions({ booking, mapsQuery }: { booking: BookingView; mapsQuery?: string }) {
  const download = () => {
    const blob = new Blob([icsFor(booking)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${booking.code}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const share = async () => {
    const text = `I'm going to ${booking.title} on ${formatDate(booking.dateYmd)}!`;
    const url = booking.href ? new URL(booking.href, window.location.origin).toString() : window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({ title: booking.title, text, url });
      } catch {}
    } else {
      await navigator.clipboard?.writeText(`${text} ${url}`);
      toast.success("Copied to clipboard");
    }
  };
  const q = encodeURIComponent(mapsQuery ?? booking.venueName);
  const act = "flex flex-1 flex-col items-center gap-1.5 py-1.5 text-xs font-semibold";
  const icon = "grid size-[50px] place-items-center rounded-full border border-line bg-surface text-brand transition-colors hover:border-line-strong";
  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" onClick={download} className={act}>
        <span className={icon}>
          <CalendarPlus className="size-5" aria-hidden />
        </span>
        Calendar
      </button>
      <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" className={act}>
        <span className={icon}>
          <MapPin className="size-5" aria-hidden />
        </span>
        Directions
      </a>
      <button type="button" onClick={share} className={act}>
        <span className={icon}>
          <Share2 className="size-5" aria-hidden />
        </span>
        Share
      </button>
      <button type="button" onClick={() => window.print()} className={act}>
        <span className={icon}>
          <Download className="size-5" aria-hidden />
        </span>
        Save PDF
      </button>
    </div>
  );
}
