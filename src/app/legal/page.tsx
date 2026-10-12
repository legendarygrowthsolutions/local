import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata: Metadata = { title: "Help, terms & privacy", robots: { index: false } };

const SECTIONS = [
  {
    id: "help",
    title: "Help & support",
    body: [
      "Your tickets and slot bookings live under Bookings. Open one to see its QR code, get directions or cancel it.",
      "Refunds follow the cancellation policy shown on the listing and at checkout. Convenience fees are non-refundable.",
      "Hosts: manage listings, bookings, check-in and payouts from the host console.",
    ],
  },
  {
    id: "terms",
    title: "Terms of use",
    body: [
      "Payments currently run in test mode: no real money is charged or refunded.",
      "The final terms will be published before launch, covering bookings, cancellations, host obligations and acceptable use.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    body: [
      "We use your mobile number to log you in and send booking updates. Your date of birth is used only for age-restricted events and is never shown publicly.",
      "Hosts see the name and phone number on bookings for their own listings. The full privacy policy will be published before launch.",
    ],
  },
];

export default function LegalPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-5 py-6 md:py-14">
      <Link href="/" className="-ml-2 inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Back to local.
      </Link>
      <h1 className="sr-only">Help, terms and privacy</h1>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-8">
          <h2 className="font-display text-[28px] font-extrabold">{s.title}</h2>
          <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
