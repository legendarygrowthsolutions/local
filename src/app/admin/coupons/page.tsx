import { requireAdminPage } from "@/lib/guards";
import { listCouponsAdmin } from "@/services/coupons";
import { repo } from "@/repositories";
import { AdminPage } from "@/components/admin/page-bits";
import { CouponManager } from "@/components/admin/coupon-manager";

export const metadata = { title: "Coupons" };

export default async function CouponsPage() {
  await requireAdminPage();
  const [coupons, cities] = await Promise.all([listCouponsAdmin(), repo.cities.listAll()]);
  return (
    <AdminPage title="Coupons" sub="Discount codes guests enter at checkout. Limit them by city, dates, order value and how many times they can be used." wide>
      <CouponManager coupons={coupons} cities={cities.map((c) => ({ id: c.id, name: c.name }))} />
    </AdminPage>
  );
}
