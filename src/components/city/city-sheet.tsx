"use client";

import { Sheet } from "@/components/ui/sheet";
import { CityPicker } from "./city-picker";

export function CitySheet({ open, onOpenChange, city }: { open: boolean; onOpenChange: (o: boolean) => void; city: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Choose your city" description="We'll show you what's on there.">
      <CityPicker current={city} compact onPicked={() => onOpenChange(false)} />
    </Sheet>
  );
}
