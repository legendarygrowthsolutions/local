import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getCityCookie, getSessionUser } from "@/lib/session";
import { repo } from "@/repositories";
import { LogoutButton } from "@/components/auth/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { memberships } from "@/services/host";

export const metadata: Metadata = { title: "Profile" };

const item = "flex min-h-[54px] items-center gap-3 border-b border-line px-4 text-[15px] font-medium transition-colors last:border-0 hover:bg-field/60";

/** Wireframe 16 */
export default async function MePage() {
  const user = (await getSessionUser())!;
  const citySlug = await getCityCookie();
  const city = citySlug ? await repo.cities.bySlug(citySlug) : null;
  const cats = await repo.categories.list();
  const interests = user.interests.map((s) => cats.find((c) => c.slug === s)?.name).filter(Boolean);
  const bookings = (await repo.bookings.listByUser(user.id)).filter((b) => ["confirmed", "requested", "checked_in"].includes(b.status)).length;
  const hostOf = (await memberships(user.id))[0];
  const isHost = hostOf?.host.status === "approved";
  const stats = [
    { n: bookings, label: "Bookings", href: "/me/bookings" },
    { n: user.saved.length, label: "Saved", href: "/me/saved" },
    { n: user.following?.length ?? 0, label: "Following", href: null },
  ];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-[18px] px-5 pt-4 md:pt-10 lg:mx-0 lg:max-w-none lg:px-0 lg:pt-0">
      <h1 className="flex h-11 items-center font-display text-[30px] font-extrabold">Profile</h1>

      <div className="flex items-center gap-3.5 lg:hidden">
        <Avatar name={user.name} src={user.avatar} className="size-16 text-[22px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-bold">{user.name}</p>
          <p className="text-[13px] text-muted">
            +91 {user.phone.slice(0, 5)} {user.phone.slice(5)}
          </p>
        </div>
        <Link href="/me/edit" className="text-sm font-bold text-brand">
          Edit
        </Link>
      </div>

      <ul className="grid grid-cols-3 gap-2 lg:gap-3">
        {stats.map((s) => {
          const body = (
            <>
              <b className="font-display text-2xl font-extrabold">{s.n}</b>
              <span className="text-xs text-muted">{s.label}</span>
            </>
          );
          return (
            <li key={s.label}>
              {s.href ? (
                <Link href={s.href} className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
                  {body}
                </Link>
              ) : (
                <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <nav aria-label="Preferences" className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <Link href={`/city?next=/${city?.slug ?? ""}`} className={item}>
            City<span className="ml-auto text-[13px] text-muted">{city?.name ?? "Choose"}</span>
          </Link>
          <Link href="/me/saved" className={item}>
            Saved experiences
          </Link>
          <Link href="/me/edit" className={item}>
            Interests<span className="ml-auto max-w-[60%] truncate text-[13px] text-muted">{interests.length ? interests.join(", ") : "Add some"}</span>
          </Link>
          <Link href="/me/notifications" className={item}>
            Notifications
          </Link>
        </nav>

        <Link href={isHost ? "/host" : "/host/apply"} className="relative flex lg:hidden items-center gap-3 overflow-hidden rounded-[20px] bg-feature p-4 text-white">
          <span className="absolute -right-[30px] -top-10 size-[110px] rounded-full bg-feature-2" aria-hidden />
          <span className="relative flex flex-1 flex-col gap-0.5">
            <span className="font-display text-[17px] font-extrabold">
              {isHost ? (
                "Host console"
              ) : hostOf ? (
                "Your host application"
              ) : (
                <>
                  Host on local<span className="text-spark">.</span>
                </>
              )}
            </span>
            <span className="text-[13px] text-feature-muted">{isHost ? `${hostOf.host.brandName} · ${hostOf.member.role}` : hostOf ? "Check your application status" : "List events or your venue — free listing"}</span>
          </span>
          <span className="relative grid size-9 place-items-center rounded-full bg-spark text-spark-ink" aria-hidden>
            <ChevronRight className="size-5" />
          </span>
        </Link>

        {user.role === "admin" && (
          <Link href="/admin" className="flex items-center gap-3 rounded-[20px] lg:order-last lg:col-span-2 border border-line bg-surface p-4 hover:border-line-strong">
            <span className="grid size-9 place-items-center rounded-full bg-ink text-white" aria-hidden>
              <ShieldCheck className="size-[18px]" />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Superadmin console</span>
              <span className="block text-[13px] text-muted">Approvals, moderation and journey templates</span>
            </span>
            <ChevronRight className="size-5 text-subtle" aria-hidden />
          </Link>
        )}

        <nav aria-label="More" className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <Link href="/legal#help" className={item}>
            Help &amp; support
          </Link>
          <Link href="/legal#terms" className={item}>
            Terms &amp; privacy
          </Link>
          <div className="lg:hidden">
            <LogoutButton />
          </div>
        </nav>
      </div>
    </main>
  );
}
