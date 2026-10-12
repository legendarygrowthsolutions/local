"use client";

import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

export function RoleToggle({ id, admin, self }: { id: string; admin: boolean; self: boolean }) {
  const set = useAdminAction<boolean>((on) => ({ url: `/api/admin/users/${id}`, method: "PUT", body: { role: on ? "admin" : "user" } }), {
    success: (on) => (on ? "Superadmin access granted" : "Superadmin access removed"),
  });
  return (
    <button
      type="button"
      role="switch"
      aria-checked={admin}
      disabled={self || set.isPending}
      title={self ? "You can't remove your own access" : undefined}
      onClick={() => set.mutate(!admin)}
      className="disabled:opacity-50"
      aria-label="Superadmin access"
    >
      <span className={cn("relative block h-6 w-10 rounded-full transition-colors", admin ? "bg-brand" : "bg-line-strong")}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-white transition-[left]", admin ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}
