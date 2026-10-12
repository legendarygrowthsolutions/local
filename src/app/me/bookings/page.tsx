import type { Metadata } from "next";
import { MyBookings } from "@/components/booking/my-bookings";
import { getCityCookie } from "@/lib/session";
import { getCity } from "@/services/catalog";

export const metadata: Metadata = { title: "My bookings" };

export default async function Page() {
  const slug = await getCityCookie();
  const city = slug ? await getCity(slug) : null;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pt-4 md:pt-10 lg:mx-0 lg:max-w-none lg:px-0 lg:pt-0">
      <h1 className="flex h-11 items-center font-display text-[30px] font-extrabold md:text-4xl">Bookings</h1>
      <MyBookings city={city ? { slug: city.slug, name: city.name } : undefined} />
    </main>
  );
}
