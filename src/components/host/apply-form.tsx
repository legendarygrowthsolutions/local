"use client";

import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft, FileText, Upload, X } from "lucide-react";
import Link from "next/link";
import { HostApplicationSchema, type HostApplicationInput } from "@/contracts";
import { useApplyHost } from "@/lib/api/host-hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { imageToDataUrl } from "@/features/host-wizard/fields";

const TYPES = [
  { id: "organiser", label: "Events & shows", body: "Gigs, comedy, festivals" },
  { id: "venue", label: "Sports venue", body: "Courts, turfs, slots" },
  { id: "instructor", label: "Workshops", body: "Classes, sessions" },
  { id: "community", label: "Community", body: "Meetups, clubs, runs" },
] as const;
const STEPS = ["Host on local.", "Verification", "Review & submit"];
const NEXT = ["Next: verification", "Next: review"];
const DOCS = [
  { kind: "pan", label: "PAN card", required: true },
  { kind: "bank", label: "Bank proof (cancelled cheque or statement)", required: true },
  { kind: "gst", label: "GST certificate", required: false },
] as const;

const input = "h-[50px] w-full rounded-[14px] border-[1.5px] border-line-strong bg-surface px-3.5 text-[15px] outline-none focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]";

/** PDFs go up as-is (≤ 2 MB); photos of documents are downscaled first. */
async function documentToDataUrl(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    if (file.size > 2 * 1024 * 1024) throw new Error("PDFs must be under 2 MB");
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Couldn't read that file"));
      r.readAsDataURL(file);
    });
  }
  if (!file.type.startsWith("image/")) throw new Error("Upload a PDF, JPG or PNG");
  return imageToDataUrl(file, 1800);
}

export function ApplyForm({ cities, defaults, phone }: { cities: { id: string; name: string }[]; defaults: Partial<HostApplicationInput>; phone: string }) {
  const router = useRouter();
  const apply = useApplyHost();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState<HostApplicationInput>({
    type: "organiser",
    brandName: "",
    cityId: cities[0].id,
    contactName: "",
    email: "",
    instagram: "",
    website: "",
    bio: "",
    expectedPerMonth: "1–2",
    wantsPaid: true,
    gstin: "",
    documents: [],
    ...defaults,
  });
  const set = (p: Partial<HostApplicationInput>) => setV((x) => ({ ...x, ...p }));

  const validate = (s: number) => {
    const res = HostApplicationSchema.safeParse(v);
    const errs: Record<string, string> = {};
    if (!res.success) for (const i of res.error.issues) errs[String(i.path[0])] ??= i.message;
    const fields: Record<number, string[]> = { 0: ["type", "brandName", "cityId", "instagram", "website"], 1: ["contactName", "email", "bio", "documents", "gstin"], 2: Object.keys(errs) };
    const relevant = Object.fromEntries(Object.entries(errs).filter(([k]) => fields[s].includes(k)));
    setErrors(relevant);
    return Object.keys(relevant).length === 0;
  };
  const next = () => validate(step) && setStep((s) => s + 1);
  const submit = () => {
    if (!validate(2)) return;
    apply.mutate(v, { onSuccess: () => router.refresh() });
  };

  const hasDoc = (k: string) => v.documents.find((d) => d.kind === k);
  const social = v.website || v.instagram;
  const setSocial = (x: string) => (/^https?:\/\//i.test(x) || x.includes(".") ? set({ website: x, instagram: "" }) : set({ instagram: x, website: "" }));

  return (
    <div className="flex flex-1 flex-col gap-4 lg:flex-none">
      <div className="flex h-11 items-center gap-1.5">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((x) => x - 1)} aria-label="Back" className="-ml-2.5 grid size-11 place-items-center">
            <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
          </button>
        ) : (
          <Link href="/" aria-label="Back to exploring" className="-ml-2.5 grid size-11 place-items-center">
            <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
          </Link>
        )}
        <span className="ml-auto text-[13px] font-semibold text-muted">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] font-extrabold leading-tight">
          {step === 0 ? (
            <>
              Host on local<span className="text-brand">.</span>
            </>
          ) : (
            STEPS[step]
          )}
        </h1>
        <p className="text-sm leading-[1.45] text-muted">
          {step === 0
            ? "Listing is free. You can sell paid tickets after KYC. Every host is reviewed by our team."
            : step === 1
              ? `A few details so our team can verify you. We'll contact you on +91 ${phone}.`
              : "Check everything before you send it."}
        </p>
      </div>

      <AnimatePresence mode="wait">
        <m.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="flex flex-col gap-4">
          {step === 0 && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-bold">I want to list</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {TYPES.map((t) => {
                    const on = v.type === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set({ type: t.id, wantsPaid: t.id !== "community" })}
                        className={cn("relative flex flex-col gap-1 rounded-2xl border-[1.5px] px-3 py-3.5 text-left transition-[border-color,box-shadow]", on ? "border-brand shadow-[0_0_0_3px_var(--color-tint)]" : "border-line-strong hover:border-ink/30", "bg-surface")}
                      >
                        <b className="pr-6 text-sm">{t.label}</b>
                        <small className="text-xs leading-[1.3] text-muted">{t.body}</small>
                        {on && (
                          <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-brand text-white" aria-hidden>
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <Field label="Brand / organiser name" error={errors.brandName}>
                <input className={input} value={v.brandName} onChange={(e) => set({ brandName: e.target.value })} placeholder="e.g. Tidewater Collective" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="City" error={errors.cityId}>
                  <select className={input} value={v.cityId} onChange={(e) => set({ cityId: e.target.value })}>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Instagram / site" error={errors.instagram ?? errors.website}>
                  <input className={input} value={social} onChange={(e) => setSocial(e.target.value)} placeholder="@handle" />
                </Field>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
                <span className="text-[13px] font-bold">After you submit</span>
                <ol className="flex items-start">
                  {[
                    { n: 1, label: "Submitted", cls: "bg-brand text-white", text: "text-ink" },
                    { n: 2, label: "In review 24–48 h", cls: "bg-tint text-brand-ink", text: "text-muted" },
                    { n: 3, label: "Approved → console", cls: "bg-field text-muted", text: "text-muted" },
                  ].map((st, i) => (
                    <li key={st.n} className={cn("flex items-start", i > 0 && "flex-1")}>
                      {i > 0 && <span className="mt-3 h-0.5 flex-1 bg-line-strong" aria-hidden />}
                      <span className={cn("flex w-[72px] flex-none flex-col items-center gap-1.5 text-center text-[11px] font-semibold", st.text)}>
                        <span className={cn("grid size-[26px] place-items-center rounded-full text-xs font-bold", st.cls)}>{st.n}</span>
                        {st.label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How often do you host?">
                  <select className={input} value={v.expectedPerMonth} onChange={(e) => set({ expectedPerMonth: e.target.value as HostApplicationInput["expectedPerMonth"] })}>
                    {["1–2", "3–5", "6–10", "10+"].map((o) => (
                      <option key={o} value={o}>
                        {o} {v.type === "venue" ? "courts" : "per month"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Contact person" error={errors.contactName}>
                  <input className={input} value={v.contactName} onChange={(e) => set({ contactName: e.target.value })} />
                </Field>
                <Field label="Email (optional)" error={errors.email}>
                  <input className={input} type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@brand.in" />
                </Field>
              </div>
              <Field label="Tell attendees about you" error={errors.bio}>
                <textarea className={cn(input, "h-28 resize-none py-3")} value={v.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="What you run, for whom, and what makes it good." />
                <span className="text-right text-xs text-subtle">{v.bio.length}/500</span>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
                {[
                  { on: false, title: "Free listings only", body: "RSVPs and info listings. No verification needed." },
                  { on: true, title: "I want to sell tickets", body: "Needs PAN and bank details for payouts." },
                ].map((o) => (
                  <button
                    key={String(o.on)}
                    type="button"
                    role="radio"
                    aria-checked={v.wantsPaid === o.on}
                    onClick={() => set({ wantsPaid: o.on })}
                    className={cn("rounded-2xl border p-4 text-left", v.wantsPaid === o.on ? "border-brand bg-tint" : "border-line bg-surface")}
                  >
                    <span className="block font-semibold">{o.title}</span>
                    <span className="block text-sm text-muted">{o.body}</span>
                  </button>
                ))}
              </div>
              {v.wantsPaid && (
                <>
                  <div className="flex flex-col gap-2">
                    {DOCS.map((d) => {
                      const doc = hasDoc(d.kind);
                      return (
                        <div key={d.kind} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                          <FileText className="size-5 text-muted" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {d.label} {!d.required && <span className="font-normal text-muted">(optional)</span>}
                            </p>
                            <p className="truncate text-xs text-muted">{doc ? doc.fileName : "PDF, JPG or PNG"}</p>
                          </div>
                          {doc ? (
                            <button type="button" onClick={() => set({ documents: v.documents.filter((x) => x.kind !== d.kind) })} className="grid size-9 place-items-center rounded-full bg-field" aria-label={`Remove ${d.label}`}>
                              <X className="size-4" />
                            </button>
                          ) : (
                            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-semibold hover:border-ink/30">
                              <Upload className="size-4" /> Upload
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                className="sr-only"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  if (!f) return;
                                  try {
                                    const data = await documentToDataUrl(f);
                                    setV((x) => ({ ...x, documents: [...x.documents.filter((y) => y.kind !== d.kind), { kind: d.kind, fileName: f.name.slice(0, 120), data }] }));
                                  } catch (err) {
                                    toast.error((err as Error).message);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                    {errors.documents && <p className="text-sm text-danger">{errors.documents}</p>}
                    <p className="text-xs text-subtle">Files are stored privately and only seen by our verification team.</p>
                  </div>
                  <Field label="GSTIN (if registered)" error={errors.gstin}>
                    <input className={cn(input, "uppercase")} value={v.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} placeholder="27ABCDE1234F1Z5" maxLength={15} />
                  </Field>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {[
                ["Host type", TYPES.find((t) => t.id === v.type)?.label],
                ["Brand", v.brandName],
                ["City", cities.find((c) => c.id === v.cityId)?.name],
                ["Contact", `${v.contactName} · +91 ${phone}`],
                ["Socials", [v.instagram, v.website].filter(Boolean).join(" · ") || "-"],
                ["Selling tickets", v.wantsPaid ? "Yes, verification needed" : "No, free listings"],
                ["Documents", v.documents.map((d) => d.fileName).join(", ") || "-"],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{val}</dd>
                </div>
              ))}
            </dl>
          )}
        </m.div>
      </AnimatePresence>

      {apply.error && <p className="text-sm text-danger">{apply.error.message}</p>}
      <div className="mt-auto flex gap-3 pt-2 lg:mt-4">
        {step < 2 ? (
          <Button size="lg" block onClick={next} className="font-bold">
            {NEXT[step]}
          </Button>
        ) : (
          <Button size="lg" block onClick={submit} loading={apply.isPending} className="font-bold">
            <Check className="size-4" /> Submit application
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[13px] font-bold">{label}</span>
      {children}
      {error && <span className="text-sm text-danger">{error}</span>}
    </label>
  );
}
