import {
  Activity, BookOpen, Brain, Brush, Camera, Code, Coffee, Dices, Drama, Footprints, Frame, Landmark, Medal, Mic, Music,
  Palette, PartyPopper, PenTool, Rocket, Sparkles, Sun, Ticket, Trophy, Users, Volleyball, type LucideIcon, type LucideProps,
} from "lucide-react";

/** Category icons come from the API as names; map them to components here. */
const ICONS: Record<string, LucideIcon> = {
  Activity, BookOpen, Brain, Brush, Camera, Code, Coffee, Dices, Drama, Footprints, Frame, Landmark, Medal, Mic, Music,
  Palette, PartyPopper, PenTool, Rocket, Sparkles, Sun, Ticket, Trophy, Users, Volleyball,
};

export const ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? Sparkles;
  return <C aria-hidden {...props} />;
}
