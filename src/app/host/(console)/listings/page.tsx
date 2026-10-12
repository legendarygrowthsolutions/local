import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHostPage } from "@/lib/host-session";
import { listHostListings } from "@/services/host";
import { PageHead } from "@/components/host/host-shell";
import { Button } from "@/components/ui/button";
import { ListingsTable } from "@/components/host/listings-table";

export const metadata = { title: "Listings" };

export default async function HostListings() {
  const ctx = await requireHostPage("/host/listings");
  const rows = await listHostListings(ctx);
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead
        title="Listings"
        sub="Events, workshops and courts you run on local."
        action={
          <Button asChild>
            <Link href="/host/listings/new">
              <Plus className="size-4" /> New listing
            </Link>
          </Button>
        }
      />
      <ListingsTable initial={rows} isOwner={ctx.isOwner} />
    </div>
  );
}
