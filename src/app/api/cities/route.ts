import { route } from "@/lib/api/handler";
import { getCities } from "@/services/catalog";

export const GET = route(async () => ({ items: await getCities() }));
