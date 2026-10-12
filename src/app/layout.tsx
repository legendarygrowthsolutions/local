import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { getSessionUser } from "@/lib/session";
import { toPublicUser } from "@/services/users";
import { SITE_NAME, SITE_URL } from "@/lib/utils";
import "./globals.css";

// Variable fonts: one preloaded file per family instead of one per weight (faster LCP).
const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });
const sans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Everything to do in your city`, template: `%s | ${SITE_NAME}` },
  description: "Events, workshops, meetups, exhibitions and sports courts near you. Discover and book in seconds.",
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: "en_IN", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#F7F7F4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en-IN" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers initialUser={user ? toPublicUser(user) : null}>{children}</Providers>
      </body>
    </html>
  );
}
