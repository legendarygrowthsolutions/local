import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-start justify-center gap-5 px-6">
      <Logo />
      <h1 className="font-display text-5xl font-bold leading-none">Lost the plot?</h1>
      <p className="text-lg text-muted">This page doesn&apos;t exist, or the event has wrapped up.</p>
      <Link href="/" className="inline-flex h-12 items-center rounded-xl bg-brand px-5 font-semibold text-white">
        Find something to do
      </Link>
    </main>
  );
}
