"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

/** Admin pages are server-rendered; mutate through the API, then refresh the route. */
export function useAdminAction<V = unknown>(toUrl: (v: V) => { url: string; method?: string; body?: unknown }, opts: { success?: string | ((v: V) => string) } = {}) {
  const router = useRouter();
  return useMutation({
    mutationFn: (v: V) => {
      const { url, method, body } = toUrl(v);
      return api<unknown>(url, { method: method ?? "POST", body });
    },
    onSuccess: (_d, v) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(v) : opts.success);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });
}
