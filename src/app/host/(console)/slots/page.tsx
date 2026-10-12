import { requireHostPage } from "@/lib/host-session";
import { PageHead } from "@/components/host/host-shell";
import { CourtCalendar } from "@/components/host/court-calendar";

export const metadata = { title: "Court calendar" };

export default async function Page() {
  const ctx = await requireHostPage("/host/slots");
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Court calendar" sub="See every booking by court. Tap a free slot to block it for maintenance or walk-ins." />
      <CourtCalendar isOwner={ctx.isOwner} />
    </div>
  );
}
