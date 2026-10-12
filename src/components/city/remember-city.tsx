"use client";

import { useEffect } from "react";
import { rememberCity } from "@/lib/geo";

/** Keeps the city cookie in sync so "/" can redirect server-side. */
export function RememberCity({ slug }: { slug: string }) {
  useEffect(() => rememberCity(slug), [slug]);
  return null;
}
