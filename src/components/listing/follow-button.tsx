"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMe, useToggleFollow } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export function FollowButton({ hostId, hostName }: { hostId: string; hostName: string }) {
  const { data: me } = useMe();
  const toggle = useToggleFollow();
  const router = useRouter();
  const pathname = usePathname();
  const on = !!me?.following.includes(hostId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Unfollow ${hostName}` : `Follow ${hostName}`}
      onClick={() => (me ? toggle.mutate(hostId) : router.push(`/login?next=${encodeURIComponent(pathname)}`))}
      className={cn(
        "h-9 flex-none rounded-full border-[1.5px] px-4 text-[13px] font-bold transition-colors",
        on ? "border-ink bg-ink text-white" : "border-ink bg-surface text-ink hover:bg-field",
      )}
    >
      {on ? "Following" : "Follow"}
    </button>
  );
}
