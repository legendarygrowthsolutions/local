import { requireHostPage } from "@/lib/host-session";
import { PageHead } from "@/components/host/host-shell";
import { CheckInScanner } from "@/components/host/checkin-scanner";

export const metadata = { title: "Check-in" };

export default async function Page() {
  await requireHostPage("/host/checkin");
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6 md:py-8">
      <PageHead title="Check-in" sub="Scan the QR on the attendee's ticket, or type the booking code." />
      <CheckInScanner />
    </div>
  );
}
