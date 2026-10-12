import { route } from "@/lib/api/handler";
import { getCategoryTree } from "@/services/catalog";

export const GET = route(async () => ({ items: await getCategoryTree() }));
