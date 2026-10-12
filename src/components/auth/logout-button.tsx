"use client";

import { useRouter } from "next/navigation";
import { useLogout } from "@/lib/api/hooks";

export function LogoutButton() {
  const logout = useLogout();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={logout.isPending}
      onClick={() =>
        logout.mutate(undefined, {
          onSuccess: () => {
            router.replace("/");
            router.refresh();
          },
        })
      }
      className="flex min-h-[54px] w-full items-center px-4 text-left text-[15px] font-medium text-danger hover:bg-danger-tint/50"
    >
      {logout.isPending ? "Logging out…" : "Log out"}
    </button>
  );
}
