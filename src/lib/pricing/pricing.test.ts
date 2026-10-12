import { describe, expect, it } from "vitest";
import { computePrice, formatINR } from "./index";

const fees = { convenienceFeePct: 3.75, convenienceFeeFlat: 0, gstOnFeePct: 18, absorbFeeAllowed: true };

describe("pricing", () => {
  it("adds convenience fee and GST on the fee", () => {
    expect(computePrice(1000, fees)).toEqual({ subtotal: 1000, discount: 0, convenienceFee: 37.5, gstOnFee: 6.75, total: 1044.25 });
  });
  it("is zero for free bookings", () => {
    expect(computePrice(0, fees).total).toBe(0);
  });
  it("caps percentage coupons", () => {
    const p = computePrice(4000, fees, { code: "X", type: "pct", value: 10, maxDiscount: 200, description: "" });
    expect(p.discount).toBe(200);
    expect(p.convenienceFee).toBe(142.5);
  });
  it("formats rupees in the Indian system", () => {
    expect(formatINR(125000)).toBe("₹1,25,000");
    expect(formatINR(1044.25)).toBe("₹1,044.25");
    expect(formatINR(0, { free: "Free" })).toBe("Free");
  });
});
