import { requireUserPage } from "@/lib/guards";
import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { getSavedCards } from "@/services/discover";
import { ListingCard } from "@/components/listing/listing-card";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await requireUserPage("/me/saved");
  const cards = await getSavedCards(user.saved);
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pt-6 md:px-8 md:pt-10 lg:mx-0 lg:max-w-none lg:px-0 lg:pt-0">
      <h1 className="font-display text-[30px] font-bold md:text-4xl">Saved</h1>
      {cards.length === 0 ? (
        <EmptyState
          icon={<Heart className="size-5" />}
          title="Nothing saved yet"
          body="Tap the heart on anything you like and it'll wait for you here."
          action={
            <Button asChild size="sm">
              <Link href="/">Explore</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <ListingCard key={c.id} card={c} layout="feature" />
          ))}
        </div>
      )}
    </main>
  );
}
