import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getListingDetailById, getVenueDetailById } from "@/services/discover";
import { or404 } from "@/lib/or404";
import { Journey } from "@/features/booking/journey";
import type { JourneyTarget } from "@/features/booking/types";

export const metadata: Metadata = { title: "Book" };

async function loadTarget(kind: string, id: string): Promise<JourneyTarget> {
  if (kind === "e") {
    const detail = await or404(getListingDetailById(id));
    if (detail.template.bookingMode === "none") notFound();
    return { kind: "e", detail };
  }
  if (kind === "v") return { kind: "v", detail: await or404(getVenueDetailById(id)) };
  notFound();
}

export default async function BookPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const target = await loadTarget(kind, id);
  return (
    <Suspense>
      <Journey target={target} />
    </Suspense>
  );
}
