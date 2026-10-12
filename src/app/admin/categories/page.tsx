import { requireAdminPage } from "@/lib/guards";
import { categoryTreeWithUsage } from "@/services/admin";
import { AdminPage } from "@/components/admin/page-bits";
import { CategoryManager } from "@/components/admin/category-manager";

export const metadata = { title: "Categories & tags" };

export default async function CategoriesPage() {
  await requireAdminPage();
  const tree = await categoryTreeWithUsage();
  return (
    <AdminPage title="Categories &amp; tags" sub="Drive navigation, URLs (/city/category/sub), filters and home rails. Sports sub-categories are the sports courts can be booked for.">
      <CategoryManager tree={tree} />
    </AdminPage>
  );
}
