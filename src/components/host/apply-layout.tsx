import Link from "next/link";
import { ArrowLeft, CalendarCheck, IndianRupee, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export const HOST_POINTS = [
  { icon: CalendarCheck, title: "List for free", body: "Free events and RSVPs go live as soon as you're approved." },
  { icon: IndianRupee, title: "Sell tickets and slots", body: "Paid ticketing unlocks once PAN and bank details are verified. Attendees pay the convenience fee." },
  { icon: ShieldCheck, title: "Your team, your rules", body: "Owners see revenue and payouts; managers handle bookings and check-in." },
];

/**
 * Host application pages. Phones get a single column; desktop splits into a dark pitch panel
 * (sticky) and the step content on the right, so the form doesn't sit in a phone-width strip.
 */
export function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-feature text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-12 lg:py-10 xl:px-16">
        <span aria-hidden className="absolute -right-24 -top-24 size-[420px] rounded-full bg-feature-2" />
        <span aria-hidden className="absolute right-24 top-40 size-32 rounded-full bg-spark/90" />
        <div className="relative flex items-center justify-between">
          <Logo onDark />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-feature-muted hover:text-white">
            <ArrowLeft className="size-4" /> Back to exploring
          </Link>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-soft">For organisers & venues</p>
          <p className="mt-3 font-display text-5xl font-bold leading-[1.05]">Reach people looking for something to do this weekend.</p>
          <ul className="mt-10 flex flex-col gap-6">
            {HOST_POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-feature-3 text-brand-soft">
                  <p.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-feature-muted">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-feature-muted">Mumbai · Pune · Nagpur — more cities soon</p>
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-7 pt-4 lg:max-w-[520px] lg:justify-center lg:px-8 lg:py-16">{children}</main>
    </div>
  );
}
