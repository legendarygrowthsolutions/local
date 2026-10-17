import { Suspense } from "react";
import { requireHostPage } from "@/lib/host-session";
import { PageHead } from "@/components/host/host-shell";
import { HostBookings } from "@/components/host/host-bookings";
import { hostSettings } from "@/services/host-settings";

export const metadata = { title: "Bookings" };

export default async function Page() {
  const ctx = await requireHostPage("/host/bookings");
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Bookings" sub={ctx.isOwner ? "Everyone who's booked, with amounts." : "Everyone who's booked. Amounts are visible to the owner only."} />
      <Suspense>
        <HostBookings isOwner={ctx.isOwner} settings={hostSettings(ctx.host)} />
      </Suspense>
    </div>
  );
}
