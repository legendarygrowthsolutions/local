import { Suspense } from "react";
import { requireHostPage } from "@/lib/host-session";
import { PageHead } from "@/components/host/host-shell";
import { HostReports } from "@/components/host/host-reports";

export const metadata = { title: "Reports" };

export default async function Page() {
  const ctx = await requireHostPage("/host/reports");
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Reports" sub={ctx.isOwner ? "Income, occupancy and when people play. Online and venue-recorded bookings together." : "Bookings, occupancy and popular timings. Money is visible to the owner only."} />
      <Suspense>
        <HostReports isOwner={ctx.isOwner} />
      </Suspense>
    </div>
  );
}
