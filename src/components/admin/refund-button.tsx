"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

export function RefundButton({ id, code, ticketValue }: { id: string; code: string; ticketValue: number }) {
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState<0 | 50 | 100>(100);
  const refund = useAdminAction<0 | 50 | 100>((refundPct) => ({ url: `/api/admin/bookings/${id}/refund`, body: { refundPct } }), {
    success: (p) => (p ? `Cancelled · ${formatINR((ticketValue * p) / 100)} refund issued` : "Cancelled without refund"),
  });
  return (
    <>
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen(true)}>
        Cancel…
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Cancel ${code}`}
        description="Overrides the host's cancellation policy. Convenience fees are not refunded."
        footer={
          <Button size="lg" block className="bg-danger hover:bg-[#9a1d14]" loading={refund.isPending} onClick={() => refund.mutate(pct, { onSuccess: () => setOpen(false) })}>
            Cancel booking{pct ? ` & refund ${formatINR((ticketValue * pct) / 100)}` : ""}
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-2 pb-2" role="radiogroup">
          {([100, 50, 0] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={pct === p} onClick={() => setPct(p)} className={cn("flex flex-col items-center gap-0.5 rounded-xl border py-3 text-sm font-semibold", pct === p ? "border-brand bg-tint text-brand-ink" : "border-line-strong")}>
              {p === 0 ? "No refund" : `${p}%`}
              <span className="text-xs font-normal text-muted">{formatINR((ticketValue * p) / 100)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
