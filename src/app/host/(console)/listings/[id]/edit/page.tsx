import { requireHostPage } from "@/lib/host-session";
import { getListingInput } from "@/services/host";
import { or404 } from "@/lib/or404";
import { wizardProps } from "@/features/host-wizard/catalog";
import { ListingWizard } from "@/features/host-wizard/wizard";

export const metadata = { title: "Edit listing" };

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireHostPage(`/host/listings/${id}/edit`);
  const [{ input, status, pendingReview, revisionNote }, props] = await Promise.all([or404(getListingInput(ctx, id)), wizardProps(ctx)]);
  return <ListingWizard {...props} id={id} initial={input} status={status} pendingReview={pendingReview} revisionNote={revisionNote} />;
}
