import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { nextToScan } from "@/services/host";

export const GET = route(async () => ({ code: await nextToScan(await requireHostApi()) }));
