import { requireHostPage } from "@/lib/host-session";
import { wizardProps } from "@/features/host-wizard/catalog";
import { ListingWizard } from "@/features/host-wizard/wizard";

export const metadata = { title: "New listing" };

export default async function NewListing() {
  const ctx = await requireHostPage("/host/listings/new");
  return <ListingWizard {...await wizardProps(ctx)} />;
}
