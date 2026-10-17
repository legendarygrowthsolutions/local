import "server-only";
import { HostSettingsSchema, type Host, type HostSettings, type JourneyTemplate, type ReschedulePolicy } from "@/contracts";
import { repo } from "@/repositories";
import { assertOwner, type HostContext } from "./host";

/** A host's operational settings with every default filled in. Unparseable or missing = defaults. */
export function hostSettings(host: Pick<Host, "settings">): HostSettings {
  const r = HostSettingsSchema.safeParse(host.settings ?? {});
  return r.success ? r.data : HostSettingsSchema.parse({});
}

/** The reschedule rule that applies to a booking: the host's override, else the booking type's default. */
export function effectiveReschedule(host: Pick<Host, "settings">, tpl: Pick<JourneyTemplate, "reschedule"> | null): ReschedulePolicy {
  const s = hostSettings(host).reschedule;
  const base = tpl?.reschedule ?? { allowed: false, hoursBefore: 24, maxTimes: 1 };
  if (s.mode === "off") return { ...base, allowed: false };
  if (s.mode === "custom") return { allowed: true, hoursBefore: s.hoursBefore, maxTimes: s.maxTimes };
  return base;
}

/** Whether this member may do a given operation under the host's permission settings. */
export function canEditBookings(ctx: HostContext, s = hostSettings(ctx.host)) {
  return ctx.isOwner || s.hostBookings.editBy === "all";
}
export function canOverridePrice(ctx: HostContext, s = hostSettings(ctx.host)) {
  return ctx.isOwner || s.hostBookings.priceOverride === "all";
}

/** Owner only: replace the given sections of the host's settings. */
export async function updateHostSettings(ctx: HostContext, patch: Partial<HostSettings>) {
  assertOwner(ctx);
  const current = hostSettings(ctx.host);
  const merged = HostSettingsSchema.parse({ ...current, ...patch });
  // Extras keep stable ids so bookings that reference them still resolve.
  merged.extras = merged.extras.map((e, i) => ({ ...e, id: e.id || `x_${Date.now().toString(36)}_${i}` }));
  const host = await repo.hosts.update(ctx.host.id, { settings: merged });
  ctx.host = host ?? ctx.host;
  return merged;
}
