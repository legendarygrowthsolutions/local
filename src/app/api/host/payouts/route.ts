import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostPayouts } from "@/services/payouts";

export const GET = route(async () => hostPayouts(await requireHostApi()));
