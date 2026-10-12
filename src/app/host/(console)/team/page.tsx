import { requireHostPage } from "@/lib/host-session";
import { listTeam } from "@/services/host";
import { PageHead } from "@/components/host/host-shell";
import { TeamManager } from "@/components/host/team-manager";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireHostPage("/host/team", { owner: true });
  const team = await listTeam(ctx);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Team" sub="Managers can edit listings, see bookings, block slots and check people in. They never see revenue or payouts." />
      <TeamManager initial={team} />
    </div>
  );
}
