"use client";

import Link from "next/link";
import { m } from "motion/react";
import { Check, CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, fromISO } from "@/lib/time";
import { cn } from "@/lib/utils";

export function ApplicationStatus({ host }: { host: { brandName: string; status: string; submittedAt: string; reviewNote: string | null; wantsPaid: boolean; kycStatus: string } }) {
  const changes = host.status === "changes";
  const rejected = host.status === "rejected";
  const steps = [
    { label: "Submitted", sub: formatDate(fromISO(host.submittedAt).ymd), done: true },
    { label: changes ? "Changes requested" : "In review", sub: changes ? "Action needed" : "Usually within a day", done: changes || rejected, warn: changes || rejected },
    { label: rejected ? "Not approved" : "Approved", sub: "You get the host console", done: false },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-semibold text-brand">{host.brandName}</p>
        <h1 className="mt-1 font-display text-[32px] font-bold leading-tight">{changes ? "A small fix needed" : rejected ? "Application not approved" : "Thanks, we're reviewing it"}</h1>
        <p className="mt-2 text-muted">{changes ? "The local. team asked for a change before approving." : "We check every host so attendees can book with confidence. You get the host console once you're approved."}</p>
      </div>
      <ol className="flex flex-col gap-0 rounded-2xl border border-line bg-surface p-5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-4">
            <div className="flex flex-col items-center">
              <m.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { delay: i * 0.12 } }}
                className={cn("grid size-8 place-items-center rounded-full text-sm font-bold", s.warn ? "bg-warn-tint text-warn" : s.done ? "bg-brand text-white" : "bg-field text-muted")}
              >
                {s.warn ? <CircleAlert className="size-4" /> : s.done ? <Check className="size-4" /> : i + 1}
              </m.span>
              {i < steps.length - 1 && <span className={cn("my-1 w-0.5 flex-1 rounded", s.done ? "bg-brand/40" : "bg-line")} style={{ minHeight: 28 }} />}
            </div>
            <div className="pb-5">
              <p className="font-semibold">{s.label}</p>
              <p className="text-sm text-muted">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>
      {host.reviewNote && (
        <div className="rounded-2xl bg-warn-tint p-4 text-sm text-warn">
          <b>Note from the local. team:</b> {host.reviewNote}
        </div>
      )}
      {changes && (
        <Button asChild size="lg" block>
          <Link href="/host/apply?edit=1">Update application</Link>
        </Button>
      )}
      {host.wantsPaid && <p className="text-sm text-muted">You can sell paid tickets once your PAN and bank details are verified. Free listings can go live as soon as you&apos;re approved.</p>}

      {host.status === "pending" && (
        <p className="flex items-start gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            We review applications within 2 working days and will message you on WhatsApp and SMS when there&apos;s an update.
          </span>
        </p>
      )}
    </div>
  );
}
