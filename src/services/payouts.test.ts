import { describe, expect, it } from "vitest";
import type { Host, User } from "@/contracts";
import { PayoutAccountInputSchema } from "@/contracts";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { bookingRow, makeListing } from "@/test/fixtures";
import { addDays, todayIST } from "@/lib/time";
import { ServiceError } from "./errors";
import { resolveHostContext } from "./host";
import { adminPayouts, cycleStart, hostPayouts, payoutsCsv, recordPayout, savePayoutAccount, voidPayout } from "./payouts";

setupTestDb();

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  return null;
}

let n = 0;
/** A fresh approved host with an owner and one listing, so demo data never mixes in. */
async function freshHost() {
  n++;
  const owner = await makeUser({ name: `Owner ${n}` });
  const host: Host = {
    id: `h_pay_${n}_${Date.now()}`, userId: owner.id, type: "organiser", slug: `payout-host-${n}-${Date.now()}`, brandName: `Payout Host ${n}`, cityId: "c_mumbai", bio: "", instagram: null,
    kycStatus: "verified", status: "approved", since: "2026", contactName: "Owner", contactPhone: owner.phone, email: null, website: null, gstin: null,
    expectedPerMonth: "", wantsPaid: true, documents: [], reviewNote: null, submittedAt: new Date().toISOString(),
  };
  await repo.hosts.insert(host);
  await repo.members.insert({ id: `hm_pay_${n}`, hostId: host.id, userId: owner.id, phone: owner.phone, name: owner.name, role: "owner", status: "active", invitedBy: null, createdAt: new Date().toISOString(), scope: null });
  const { listing } = await makeListing({ listing: { hostId: host.id } });
  const ctx = (await resolveHostContext((await repo.users.byId(owner.id)) as User, host.id))!;
  return { host, owner, listing, ctx };
}

const lastWeek = () => addDays(cycleStart(todayIST()), -7);
const madeOn = (ymd: string) => new Date(Date.parse(`${ymd}T12:00:00+05:30`)).toISOString();

async function sale(listingId: string, ymd: string, subtotal: number, discount = 0, extra: Partial<Parameters<typeof bookingRow>[0]> = {}) {
  const u = await makeUser();
  return repo.bookings.insert(
    bookingRow({ userId: u.id, listingId, createdAt: madeOn(ymd), paymentRef: `pay_${Math.random()}`, price: { subtotal, discount, convenienceFee: 20, gstOnFee: 3.6, total: subtotal - discount + 23.6 }, ...extra }),
  );
}

describe("payout statements", () => {
  it("hosts earn the full ticket value (coupons are platform-funded), less the refunded share; unpaid bookings don't count", async () => {
    const { listing, ctx } = await freshHost();
    const wk = lastWeek();
    await sale(listing.id, wk, 1000, 100); // coupon: host still earns 1000
    const half = await sale(listing.id, addDays(wk, 1), 400, 0, { status: "refunded" });
    await repo.payments.insert({ id: `rf_${half.id}`, bookingId: half.id, provider: "test", method: "refund", status: "refund", amount: 200, ref: "rf1", createdAt: new Date().toISOString() });
    await sale(listing.id, addDays(wk, 2), 999, 0, { paymentRef: null, status: "held" }); // never paid
    const p = await hostPayouts(ctx);
    const c = p.cycles.find((x) => x.from === wk)!;
    expect(c).toMatchObject({ bookings: 2, gross: 1400, refunds: 200, net: 1200, status: "due" });
    expect(p.account).toBeNull();
    expect(p.next).toMatchObject({ amount: 1200 });
  });

  it("is owner only", async () => {
    const { host } = await freshHost();
    const manager = await makeUser();
    await repo.members.insert({ id: `hm_mgr_${n}`, hostId: host.id, userId: manager.id, phone: manager.phone, name: null, role: "manager", status: "active", invitedBy: null, createdAt: new Date().toISOString(), scope: null });
    const mctx = (await resolveHostContext(manager, host.id))!;
    expect(await err(hostPayouts(mctx))).toMatchObject({ status: 403 });
    expect(await err(savePayoutAccount(mctx, PayoutAccountInputSchema.parse({ method: "upi", holderName: "X Y", upiId: "xy@okbank" })))).toMatchObject({ status: 403 });
  });
});

describe("payout accounts", () => {
  it("validates bank details and masks the account number for the host", async () => {
    const { ctx } = await freshHost();
    expect(PayoutAccountInputSchema.safeParse({ method: "bank", holderName: "Asha Rao", accountNumber: "12", ifsc: "BAD", bankName: "" }).success).toBe(false);
    expect(PayoutAccountInputSchema.safeParse({ method: "upi", holderName: "Asha Rao", upiId: "nope" }).success).toBe(false);
    const a = await savePayoutAccount(ctx, PayoutAccountInputSchema.parse({ method: "bank", holderName: "Asha Rao", accountNumber: "123456789012", ifsc: "sbin0001234", bankName: "State Bank of India" }));
    expect(a).toMatchObject({ accountNumber: "···· 9012", ifsc: "SBIN0001234" });
    expect((await hostPayouts(ctx)).account).toMatchObject({ label: "State Bank of India ···· 9012" });
    expect(await repo.payoutAccounts.get(ctx.host.id)).toMatchObject({ accountNumber: "123456789012" }); // full number kept for the admin
  });
});

describe("recording payouts", () => {
  it("records a payout with UTR, TDS and adjustment; the week then shows as paid with the reference", async () => {
    const { listing, ctx, host } = await freshHost();
    const admin = await makeUser({ role: "admin", name: "Accounts" });
    const wk = lastWeek();
    await sale(listing.id, wk, 2000);
    await savePayoutAccount(ctx, PayoutAccountInputSchema.parse({ method: "upi", holderName: "Owner", upiId: "owner@okbank" }));
    expect((await adminPayouts()).due.find((d) => d.hostId === host.id)).toMatchObject({ net: 2000, account: { upiId: "owner@okbank" } });

    const rec = await recordPayout(admin, { hostId: host.id, cycleFrom: wk, deductions: 20, adjustment: -30, method: "upi", reference: "utr123456", paidOn: todayIST(), notes: "1% TDS" });
    expect(rec).toMatchObject({ gross: 2000, amount: 1950, reference: "UTR123456", paidTo: "UPI owner@okbank" });
    expect((await adminPayouts()).due.find((d) => d.hostId === host.id)).toBeUndefined();
    const cycle = (await hostPayouts(ctx)).cycles.find((c) => c.from === wk)!;
    expect(cycle).toMatchObject({ status: "paid", paid: { amount: 1950, reference: "UTR123456", deductions: 20 } });

    // One live record per host and week.
    expect(await err(recordPayout(admin, { hostId: host.id, cycleFrom: wk, deductions: 0, adjustment: 0, method: "upi", reference: "UTR999999", paidOn: todayIST() }))).toMatchObject({ code: "payout_exists" });

    // Voiding keeps the record, says why, and puts the week back in the due list.
    await voidPayout(admin, rec.id, "Wrong UTR entered");
    const hist = (await adminPayouts()).history.find((h) => h.id === rec.id)!;
    expect(hist).toMatchObject({ voidReason: "Wrong UTR entered", voidedByName: "Accounts", recordedByName: "Accounts" });
    expect((await adminPayouts()).due.find((d) => d.hostId === host.id)).toMatchObject({ net: 2000 });
    expect(await payoutsCsv(host.id)).toMatch(/UTR123456.*Voided,Wrong UTR entered/);
  });

  it("refuses the current week, future dates, non-Monday cycles, zero amounts and bank payouts with no details", async () => {
    const { listing, host } = await freshHost();
    const admin = await makeUser({ role: "admin" });
    const wk = lastWeek();
    await sale(listing.id, wk, 500);
    const base = { hostId: host.id, cycleFrom: wk, deductions: 0, adjustment: 0, method: "bank_transfer" as const, reference: "UTR000001", paidOn: todayIST() };
    expect(await err(recordPayout(admin, { ...base, cycleFrom: cycleStart(todayIST()) }))).toMatchObject({ status: 400 });
    expect(await err(recordPayout(admin, { ...base, paidOn: addDays(todayIST(), 1) }))).toMatchObject({ status: 400 });
    expect(await err(recordPayout(admin, { ...base, cycleFrom: addDays(wk, 1) }))).toMatchObject({ status: 400 });
    expect(await err(recordPayout(admin, { ...base, method: "cheque", deductions: 500 }))).toMatchObject({ status: 400 });
    expect(await err(recordPayout(admin, base))).toMatchObject({ status: 400, message: expect.stringContaining("payout details") });
    // A cheque needs no account on file.
    expect(await recordPayout(admin, { ...base, method: "cheque", reference: "CHQ004512" })).toMatchObject({ amount: 500, paidTo: "Cheque" });
  });
});
