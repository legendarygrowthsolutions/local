import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft } from "lucide-react";
import { config } from "@/lib/config";
import { COMPANY, SITE_NAME } from "@/lib/utils";

export const metadata: Metadata = { title: "Help, terms & privacy", description: `Help, terms of use, refunds and privacy policy for ${SITE_NAME}` };

const UPDATED = "15 October 2026";
const C = COMPANY;

type Block = { h?: string; p: string[] };
type Section = { id: string; title: string; blocks: Block[] };

const SECTIONS: Section[] = [
  {
    id: "help",
    title: "Help & support",
    blocks: [
      {
        p: [
          "Your tickets and court bookings are under Bookings. Open one to see its QR code, get directions or cancel it.",
          "Show the QR code at the entry. The host scans it, or types in the booking code printed below it.",
          `Something wrong with a booking, a payment or a refund? Write to ${C.email} with your booking code. We reply within two working days.`,
          "Hosts can manage listings, bookings, check-in and payouts from the host console.",
        ],
      },
    ],
  },
  {
    id: "terms",
    title: "Terms of use",
    blocks: [
      {
        p: [
          `${SITE_NAME} is operated by ${C.legalName}, a limited liability partnership based in ${C.city}, ${C.state}, India ("we", "us"). By using the website or booking through it, you agree to these terms.`,
        ],
      },
      {
        h: "What we do",
        p: [
          "We are a marketplace. Events, workshops, classes and sports facilities listed here are run by independent hosts. The host is responsible for the event or venue, its safety, its content and for honouring your booking. We handle the listing, the booking and the payment.",
        ],
      },
      {
        h: "Your account",
        p: [
          "You sign in with your mobile number and a one-time code. Keep your phone secure: anyone who can read your codes can use your account. You must be 18 or older to book, or book with a parent's or guardian's permission.",
          "Give accurate details. Hosts may check the name on a booking at the entry.",
        ],
      },
      {
        h: "Bookings and prices",
        p: [
          "Prices are set by hosts and shown in Indian rupees. We add a convenience fee and GST on that fee, both shown before you pay. A booking is confirmed only when payment succeeds and you get a booking code.",
          "Seats and slots are held for a few minutes while you pay. If the timer runs out, the hold is released.",
          "Coupons are subject to the conditions shown with them and can be withdrawn at any time. One coupon per booking.",
        ],
      },
      {
        h: "Changes and cancellations by hosts",
        p: [
          "If a host cancels an event or a slot, you get a full refund of what you paid, including the convenience fee. If a host changes the date, time or venue in a material way, you can cancel for a full refund.",
        ],
      },
      {
        h: "Hosts",
        p: [
          "Hosts must complete verification (PAN and bank details) before selling paid tickets, keep their listings accurate, honour every confirmed booking and follow the law, including permissions and licences for their event or venue. We may review, edit, pause or remove any listing, and suspend any host account, to protect guests.",
          "Hosts are paid the ticket value of their bookings, less refunds, on a weekly cycle. Tax deducted at source, where it applies, is deducted and reported under the host's PAN.",
        ],
      },
      {
        h: "Things you can't do",
        p: [
          "Resell tickets for profit, use bots or scripts to book, misuse coupons, give false details, or use the platform for anything unlawful. We may cancel bookings and close accounts that do.",
        ],
      },
      {
        h: "Liability",
        p: [
          "We are not responsible for how a host runs an event or venue, or for loss or injury there, except where the law says otherwise. Where we are liable, our liability is limited to the amount you paid us for the booking in question.",
        ],
      },
      {
        h: "Governing law",
        p: [`These terms are governed by the laws of India. Courts in ${C.city} have exclusive jurisdiction. We may update these terms; the date below shows the latest version.`],
      },
    ],
  },
  {
    id: "refunds",
    title: "Cancellations & refunds",
    blocks: [
      {
        p: [
          "Each listing shows its cancellation policy before you pay: full refund until a cut-off time, a partial refund, or no refund. You can cancel from the booking page while the policy allows it.",
          "Refunds cover the ticket value. The convenience fee and its GST are not refunded, unless the host cancelled.",
          "Refunds go back to the original payment method within 5 to 7 working days of the cancellation. Your bank may take a little longer to show it.",
          `If a payment was taken but no booking was confirmed, the money is refunded automatically. If you don't see it within 7 working days, write to ${C.email}.`,
        ],
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy policy",
    blocks: [
      {
        p: [`This policy explains how ${C.legalName} collects and uses personal data on ${SITE_NAME}, in line with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.`],
      },
      {
        h: "What we collect",
        p: [
          "Your mobile number, and if you add them, your name, email, date of birth, gender, city, interests and profile photo. Your bookings, saved listings and the hosts you follow.",
          "Payment status and references from our payment partner. We never see or store your card, UPI PIN or bank login.",
          "From hosts: business and contact details, PAN, GSTIN, bank or UPI details for payouts, and verification documents.",
          "Basic technical data such as IP address and device type, used for security and to stop abuse.",
        ],
      },
      {
        h: "How we use it",
        p: [
          "To sign you in, confirm and manage bookings, process payments and refunds, pay hosts, prevent fraud, answer support requests and meet legal and tax obligations. With your permission, to send you offers. You can turn offers off in your notification settings.",
        ],
      },
      {
        h: "Who we share it with",
        p: [
          "The host of an event or venue you book sees your name, phone number and any answers you gave at checkout, so they can let you in. We share data with service providers who help us run the platform (SMS delivery, payments, hosting), only for that purpose. We share data with authorities when the law requires it. We don't sell personal data.",
        ],
      },
      {
        h: "How long we keep it",
        p: [
          "Account data is kept while your account is open. Booking, payment and payout records are kept for 8 years, as tax and accounting law requires. Verification documents are kept while a host account is active and for 3 years after it closes.",
        ],
      },
      {
        h: "Your rights",
        p: [
          `You can see and correct your profile at any time. To get a copy of your data, withdraw consent or have your account deleted, write to ${C.email}. Records we have to keep by law are kept even after deletion.`,
        ],
      },
      {
        h: "Cookies",
        p: ["We use one essential cookie to keep you signed in, and remember your city on your device. We don't use advertising cookies."],
      },
    ],
  },
  {
    id: "grievance",
    title: "Grievance officer",
    blocks: [
      {
        p: [
          `For complaints about content, bookings or the use of your personal data, contact our Grievance Officer at ${C.email}, or write to: Grievance Officer, ${C.legalName}, ${C.city}, ${C.state}, India. We acknowledge complaints within 24 hours and resolve them within 15 days.`,
        ],
      },
    ],
  },
];

export default async function LegalPage() {
  await connection(); // the payment mode is read at runtime
  const testPayments = config.paymentProvider() === "test";
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-5 py-6 md:py-14">
      <Link href="/" className="-ml-2 inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Back to {SITE_NAME}
      </Link>
      <div>
        <h1 className="font-display text-[32px] font-extrabold leading-tight">Help, terms & privacy</h1>
        <p className="mt-1 text-sm text-muted">
          {C.legalName} · {C.city}, {C.state} · Last updated {UPDATED}
        </p>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-semibold hover:border-ink/30">
              {s.title}
            </a>
          ))}
        </nav>
      </div>
      {testPayments && <p className="rounded-xl bg-warn-tint px-4 py-3 text-sm text-warn">Payments are in test mode right now: no real money is charged or refunded.</p>}
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-8">
          <h2 className="font-display text-[26px] font-extrabold">{s.title}</h2>
          <div className="mt-3 flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2">
            {s.blocks.map((b, i) => (
              <div key={i} className="flex flex-col gap-2">
                {b.h && <h3 className="font-semibold text-ink">{b.h}</h3>}
                {b.p.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
