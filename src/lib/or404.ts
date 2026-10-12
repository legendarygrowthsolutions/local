import "server-only";
import { notFound } from "next/navigation";
import { ServiceError } from "@/services/errors";

/** Map service 404s to the Next.js not-found page; rethrow everything else. */
export async function or404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
}
