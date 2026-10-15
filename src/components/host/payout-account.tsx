"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Landmark, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Draft = { method: "bank" | "upi"; holderName: string; accountNumber: string; confirmNumber: string; ifsc: string; bankName: string; upiId: string };
const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]";

/** "Paid to" card on the payouts page, with a sheet to add or change where payouts go. */
export function PayoutAccountCard({ label, holderName, kycStatus }: { label: string | null; holderName: string | null; kycStatus: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: (d: Draft) =>
      api("/api/host/payouts/account", {
        method: "PUT",
        body: d.method === "bank" ? { method: "bank", holderName: d.holderName, accountNumber: d.accountNumber, ifsc: d.ifsc, bankName: d.bankName } : { method: "upi", holderName: d.holderName, upiId: d.upiId },
      }),
    onSuccess: () => {
      toast.success("Payout details saved");
      setDraft(null);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const mismatch = draft?.method === "bank" && draft.confirmNumber !== "" && draft.confirmNumber !== draft.accountNumber;
  const ready =
    !!draft &&
    draft.holderName.trim().length >= 2 &&
    (draft.method === "upi" ? draft.upiId.includes("@") : draft.accountNumber.length >= 9 && draft.confirmNumber === draft.accountNumber && draft.ifsc.length === 11 && !!draft.bankName.trim());

  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-line bg-surface p-5">
      <p className="text-xs font-semibold text-muted">Paid to</p>
      <p className="flex items-center gap-2 font-semibold">
        <Landmark className="size-4 text-brand" /> {label ?? "No payout details yet"}
      </p>
      {holderName && <p className="text-xs text-muted">{holderName}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className={cn("size-3.5", kycStatus === "verified" ? "text-free" : "text-warn")} /> KYC {kycStatus === "verified" ? "verified" : kycStatus === "pending" ? "in review" : "not started"}
      </p>
      <Button size="sm" variant={label ? "secondary" : "primary"} className="mt-2 w-fit" onClick={() => setDraft({ method: "bank", holderName: holderName ?? "", accountNumber: "", confirmNumber: "", ifsc: "", bankName: "", upiId: "" })}>
        {label ? "Change details" : "Add payout details"}
      </Button>
      <Sheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title="Where should we pay you?"
        description="Payouts go to this account every week. It should be in the name on your PAN or business registration."
        footer={
          draft && (
            <Button size="lg" block loading={save.isPending} disabled={!ready} onClick={() => save.mutate(draft)}>
              Save payout details
            </Button>
          )
        }
      >
        {draft && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-field p-1" role="radiogroup" aria-label="Payout method">
              {(["bank", "upi"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={draft.method === m}
                  onClick={() => setDraft({ ...draft, method: m })}
                  className={cn("h-10 rounded-lg text-sm font-semibold", draft.method === m ? "bg-surface shadow-[0_1px_2px_rgba(20,18,31,.08)]" : "text-muted")}
                >
                  {m === "bank" ? "Bank account" : "UPI"}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Account holder name</span>
              <input className={input} value={draft.holderName} onChange={(e) => setDraft({ ...draft, holderName: e.target.value })} autoComplete="name" />
            </label>
            {draft.method === "bank" ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">Account number</span>
                  <input className={cn(input, "font-mono")} inputMode="numeric" value={draft.accountNumber} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })} autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">Confirm account number</span>
                  <input className={cn(input, "font-mono", mismatch && "border-danger")} inputMode="numeric" value={draft.confirmNumber} onChange={(e) => setDraft({ ...draft, confirmNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })} autoComplete="off" />
                  {mismatch && <span className="text-xs text-danger">The account numbers don&apos;t match</span>}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold">IFSC</span>
                    <input className={cn(input, "font-mono uppercase")} value={draft.ifsc} onChange={(e) => setDraft({ ...draft, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} placeholder="HDFC0001234" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold">Bank</span>
                    <input className={input} value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} placeholder="e.g. State Bank of India" />
                  </label>
                </div>
              </>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">UPI ID</span>
                <input className={cn(input, "font-mono")} value={draft.upiId} onChange={(e) => setDraft({ ...draft, upiId: e.target.value.trim() })} placeholder="name@okbank" autoComplete="off" />
              </label>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
