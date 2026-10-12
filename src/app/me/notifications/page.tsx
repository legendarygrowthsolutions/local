import type { Metadata } from "next";
import { NotificationSettings } from "@/components/auth/notification-settings";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-[18px] px-5 pt-4 md:pt-10 lg:mx-0 lg:max-w-none lg:px-0 lg:pt-0 lg:max-w-3xl">
      <NotificationSettings />
    </main>
  );
}
