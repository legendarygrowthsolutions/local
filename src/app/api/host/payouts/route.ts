import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostPayouts } from "@/services/host";

export const GET = route(async () => hostPayouts(await requireHostApi()));
