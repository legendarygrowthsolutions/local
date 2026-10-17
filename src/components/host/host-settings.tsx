"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useUpdateHostProfile } from "@/lib/api/host-hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HOST_SLUG_HINT, HOST_SLUG_RE } from "@/lib/slug";

const DOC_LABEL: Record<string, string> = { pan: "PAN card", bank: "Bank proof", gst: "GST certificate", id_proof: "ID proof" };
const input = "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]";

export function HostSettings({
  host,
  linkBase,
}: {
  host: { slug: string; brandName: string; bio: string; instagram: string; email: string; kycStatus: string; gstin: string | null; documents: { kind: string; fileName: string; status: string; mediaId?: string | null }[] };
  /** Absolute prefix of the public page, e.g. https://local.in/h/ */
  linkBase: string;
}) {
  const initial = { slug: host.slug, brandName: host.brandName, bio: host.bio, instagram: host.instagram, email: host.email };
  const [v, setV] = useState(initial);
  const save = useUpdateHostProfile();
  const router = useRouter();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const slugOk = HOST_SLUG_RE.test(v.slug);
  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-4 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(v, { onSuccess: () => (toast.success("Profile saved"), router.refresh()), onError: (er) => toast.error(er.message) });
        }}
      >
        <h2 className="font-display text-lg font-bold">Public profile</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Brand name</span>
          <input className={input} value={v.brandName} onChange={(e) => setV({ ...v, brandName: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">About</span>
          <textarea className={cn(input, "h-28 resize-none py-3")} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Instagram</span>
            <input className={input} value={v.instagram} onChange={(e) => setV({ ...v, instagram: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Email</span>
            <input className={input} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </label>
        </div>
        <div id="link" className="flex scroll-mt-24 flex-col gap-1.5">
          <label htmlFor="host-slug" className="text-sm font-semibold">
            Page link
          </label>
          <div className={cn("flex h-12 items-center overflow-hidden rounded-xl border bg-surface focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--color-tint)]", slugOk ? "border-line-strong" : "border-danger")}>
            <span className="hidden h-full items-center border-r border-line bg-field px-3 text-sm text-muted sm:flex">{linkBase.replace(/^https?:\/\//, "")}</span>
            <input
              id="host-slug"
              className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[15px] outline-none"
              value={v.slug}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!slugOk}
              aria-describedby="host-slug-hint"
              onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            />
          </div>
          <p id="host-slug-hint" className={cn("flex flex-wrap items-center gap-x-2 text-[13px]", slugOk ? "text-muted" : "text-danger")}>
            {slugOk ? (
              <>
                Share this link in your bio:
                <a href={`${linkBase}${host.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-brand underline-offset-2 hover:underline">
                  {linkBase.replace(/^https?:\/\//, "")}
                  {host.slug} <ExternalLink className="size-3" aria-hidden />
                </a>
                {v.slug !== host.slug && <span>Changing it breaks the old link.</span>}
              </>
            ) : (
              `Use ${HOST_SLUG_HINT}.`
            )}
          </p>
        </div>
        <Button type="submit" className="w-fit" disabled={!dirty || !slugOk} loading={save.isPending}>
          Save profile
        </Button>
      </form>

      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Verification</h2>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", host.kycStatus === "verified" ? "bg-free-tint text-free" : host.kycStatus === "pending" ? "bg-warn-tint text-warn" : "bg-field text-muted")}>
            <ShieldCheck className="size-3.5" /> {host.kycStatus === "verified" ? "Verified" : host.kycStatus === "pending" ? "In review" : "Not started"}
          </span>
        </div>
        <p className="text-sm text-muted">Needed for paid ticketing and payouts. Free listings don&apos;t need it.</p>
        {host.documents.length ? (
          <ul className="flex flex-col gap-2">
            {host.documents.map((d) => (
              <li key={d.kind} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                <FileText className="size-4 text-muted" />
                <span className="flex-1">
                  <b>{DOC_LABEL[d.kind] ?? d.kind}</b> · {d.mediaId ? (
                    <a href={`/api/documents/${d.mediaId}`} target="_blank" rel="noopener" className="font-semibold text-brand underline-offset-2 hover:underline">
                      {d.fileName}
                    </a>
                  ) : (
                    <span className="text-muted">{d.fileName}</span>
                  )}
                </span>
                <span className={cn("font-semibold", d.status === "verified" ? "text-free" : d.status === "rejected" ? "text-danger" : "text-warn")}>{d.status === "uploaded" ? "In review" : d.status[0].toUpperCase() + d.status.slice(1)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-field p-3 text-sm">No documents yet. To add verification documents, resubmit your application from Host on local.</p>
        )}
        {host.gstin && <p className="text-sm text-muted">GSTIN {host.gstin}</p>}
      </section>
    </div>
  );
}
