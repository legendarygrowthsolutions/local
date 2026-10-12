import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HostPromo() {
  return (
    <section className="px-4 md:px-0">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] bg-feature p-6 text-white md:flex-row md:items-center md:justify-between md:p-10">
        <div className="absolute -left-10 -top-16 size-60 rounded-full bg-spark/25 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-soft">For organisers & venues</p>
          <h2 className="mt-1 font-display text-2xl font-bold md:text-3xl">Run something people love?</h2>
          <p className="mt-1 max-w-md text-sm text-feature-muted">List events for free, sell tickets and fill your courts. Get approved in a day.</p>
        </div>
        <Link href="/host/apply" className="relative inline-flex h-12 w-fit items-center gap-2 rounded-xl bg-white px-5 font-semibold text-ink">
          Host on local. <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
