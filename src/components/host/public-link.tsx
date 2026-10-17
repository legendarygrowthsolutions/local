"use client";

import Link from "next/link";
import { Check, Copy, ExternalLink, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Your public page" card (host console). One link a host can paste into an Instagram bio or WhatsApp status:
 * everything they have on sale, bookable in one place.
 */
export function PublicLinkCard({ url, brandName, canEdit }: { url: string; brandName: string; canEdit: boolean }) {
  const [copied, setCopied] = useState(false);
  const pretty = url.replace(/^https?:\/\//, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Long-press the link to copy it.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${brandName} on local.`, text: `Book ${brandName}'s events and courts`, url });
      } catch {}
      return;
    }
    copy();
  };
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[#e6e6e1] bg-surface p-4 md:flex-row md:items-center md:gap-5 md:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tint text-brand" aria-hidden>
        <Link2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-bold">Your public page</h2>
        <p className="text-sm text-muted">Put this link in your Instagram bio. People see all your events and venues and book right there.</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <a href={url} target="_blank" rel="noopener" className="truncate underline-offset-2 hover:underline" data-testid="public-link">
            {pretty}
          </a>
          <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={copy} aria-live="polite">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={share}>
          <Share2 className="size-4" aria-hidden /> Share
        </Button>
        {canEdit && (
          <Button asChild size="sm" variant="ghost">
            <Link href="/host/settings#link">Edit link</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
