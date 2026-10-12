import type { JourneyTemplate, PriceBreakdown } from "@/contracts";

export interface Coupon {
  code: string;
  type: "pct" | "flat";
  value: number;
  maxDiscount: number;
  description: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Convenience fee is paid by the user (decision 2026-10-11), with GST on the fee. */
export function computePrice(subtotal: number, fees: JourneyTemplate["fees"], coupon?: Coupon | null): PriceBreakdown {
  if (subtotal <= 0) return { subtotal: 0, discount: 0, convenienceFee: 0, gstOnFee: 0, total: 0 };
  let discount = 0;
  if (coupon) {
    discount = coupon.type === "pct" ? (subtotal * coupon.value) / 100 : coupon.value;
    discount = Math.min(discount, coupon.maxDiscount, subtotal);
  }
  const net = subtotal - discount;
  const convenienceFee = net > 0 ? r2((net * fees.convenienceFeePct) / 100 + fees.convenienceFeeFlat) : 0;
  const gstOnFee = r2((convenienceFee * fees.gstOnFeePct) / 100);
  return { subtotal: r2(subtotal), discount: r2(discount), convenienceFee, gstOnFee, total: r2(net + convenienceFee + gstOnFee) };
}

export function formatINR(amount: number, opts: { free?: string } = {}) {
  if (amount === 0 && opts.free) return opts.free;
  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  return (
    "₹" +
    amount.toLocaleString("en-IN", { minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2 })
  );
}
