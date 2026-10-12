import type { PriceBreakdown as P } from "@/contracts";
import { formatINR } from "@/lib/pricing";

/** Wireframe 12 price card: item line, fees, rule, bold total. */
export function PriceBreakdown({ price, coupon, itemsLabel = "Subtotal" }: { price: P; coupon?: string | null; itemsLabel?: string }) {
  return (
    <dl className="flex flex-col gap-2 text-sm text-ink-2">
      <Row label={itemsLabel} value={formatINR(price.subtotal)} />
      {price.discount > 0 && <Row label={`Coupon ${coupon ?? ""}`} value={`− ${formatINR(price.discount)}`} className="text-free" />}
      {price.convenienceFee > 0 && <Row label="Convenience fee" value={formatINR(price.convenienceFee)} />}
      {price.gstOnFee > 0 && <Row label="GST on fee (18%)" value={formatINR(price.gstOnFee)} />}
      <div className="h-px bg-line" />
      <div className="flex items-baseline justify-between text-[17px] font-extrabold text-ink">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatINR(price.total, { free: "Free" })}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between gap-4 ${className ?? ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
