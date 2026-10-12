import { FeatureSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { setFeatured } from "@/services/admin";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { featured } = await body(req, FeatureSchema);
  await setFeatured((await params).id, featured);
  return { ok: true };
});
