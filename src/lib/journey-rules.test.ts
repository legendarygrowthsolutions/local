import { describe, expect, it } from "vitest";
import templates from "@/db/seed/fixtures/templates.json";
import type { JourneyTemplate } from "@/contracts";
import { templateErrors } from "./journey-rules";

const all = templates as JourneyTemplate[];
const strip = ({ id: _id, ...t }: JourneyTemplate) => t;

describe("journey template rules", () => {
  it.each(all.map((t) => [t.name, t] as const))("seed template “%s” is valid", (_n, t) => {
    expect(templateErrors(strip(t))).toEqual([]);
  });

  it("rejects payment before review", () => {
    const t = strip(all.find((x) => x.id === "tpl_ticket_single")!);
    const steps = [...t.steps];
    const r = steps.findIndex((s) => s.type === "review");
    const p = steps.findIndex((s) => s.type === "payment");
    [steps[r], steps[p]] = [steps[p], steps[r]];
    expect(templateErrors({ ...t, steps })).toContain("Payment comes after review");
  });

  it("requires confirmation last and slot steps only for slot mode", () => {
    const t = strip(all.find((x) => x.id === "tpl_rsvp")!);
    const errs = templateErrors({ ...t, steps: [...t.steps.filter((s) => s.type !== "confirmation"), { type: "pick_slots", required: true, config: {} }] });
    expect(errs).toContain("Every booking journey ends with a confirmation step");
    expect(errs).toContain("Sport, court and slot steps are only for slot bookings");
  });

  it("keeps RSVPs free and registrations team-based", () => {
    const rsvp = strip(all.find((x) => x.id === "tpl_rsvp")!);
    expect(templateErrors({ ...rsvp, pricing: "paid" })).toContain("RSVPs are free");
    const reg = strip(all.find((x) => x.id === "tpl_competition")!);
    expect(templateErrors({ ...reg, steps: reg.steps.filter((s) => s.type !== "team_details") })).toContain("Registrations need a team details step");
  });
});
