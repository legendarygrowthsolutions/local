"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddChargeInput, BulkScheduleInput, ExtendBookingInput, HostApplicationInput, HostBookingInput, HostMember, HostSettings, ListingInput, PaymentMethod } from "@/contracts";
import type { HostBookingRow, HostListingRow, TeamTarget } from "@/services/host";
import type { BulkResult, HostBookingDetail } from "@/services/host-ops";
import type { HostReport, ReportRange } from "@/services/reports";
import { api, qs } from "./client";

export const hostKeys = {
  listings: ["host", "listings"] as const,
  bookings: (p: Record<string, unknown>) => ["host", "bookings", p] as const,
  schedule: (venue?: string, date?: string) => ["host", "schedule", venue, date] as const,
  team: ["host", "team"] as const,
  payouts: ["host", "payouts"] as const,
};

export function useApplyHost() {
  return useMutation({ mutationFn: (input: HostApplicationInput) => api<{ host: unknown }>("/api/host/apply", { body: input }) });
}

export function useSaveListing(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { input: ListingInput; submit: boolean }) =>
      api<{ id: string; status: string; pendingReview?: boolean }>(id ? `/api/host/listings/${id}` : "/api/host/listings", { method: id ? "PUT" : "POST", body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hostKeys.listings }),
  });
}

export function useHostListings(initial?: HostListingRow[]) {
  return useQuery({ queryKey: hostKeys.listings, queryFn: () => api<{ items: HostListingRow[] }>("/api/host/listings").then((r) => r.items), initialData: initial });
}

export function useHostBookings(p: { when: string; target?: string; q?: string; source?: string; due?: string; pay?: string }) {
  return useQuery({
    queryKey: hostKeys.bookings(p),
    queryFn: ({ signal }) => api<{ total: number; items: HostBookingRow[]; targets: { id: string; title: string }[] }>(`/api/host/bookings${qs(p)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export interface CheckInResult {
  result: "ok" | "already" | "invalid" | "early";
  message: string;
  booking: HostBookingRow;
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<CheckInResult>("/api/host/checkin", { body: { code } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host", "bookings"] }),
  });
}

export type ScheduleSlot = {
  startMins: number;
  endMins: number;
  price: number | null;
  peak: boolean;
  status: string;
  isPast: boolean;
  booking: { id: string; code: string; customer: string; status: string; source: "online" | "host"; amountDue: number | null } | null;
  block: { id: string; reason: string } | null;
};
export interface Schedule {
  venues: { id: string; name: string }[];
  venueId: string;
  date: string;
  dates: string[];
  resources: { resource: { id: string; name: string; sport: string; slotLengthMins: number; indoor: boolean }; slots: ScheduleSlot[] }[];
}

export function useSchedule(venue?: string, date?: string) {
  return useQuery({
    queryKey: hostKeys.schedule(venue, date),
    queryFn: () => api<{ schedule: Schedule | null }>(`/api/host/schedule${qs({ venue, date })}`).then((r) => r.schedule),
    placeholderData: keepPreviousData,
  });
}

export function useAddBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { resourceId: string; date: string; startMins: number; endMins: number; reason: string }) => api("/api/host/blocks", { body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host", "schedule"] }),
  });
}

export function useRemoveBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/host/blocks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host", "schedule"] }),
  });
}

export interface Team {
  items: HostMember[];
  /** The host's venues and events a member can be scoped to. */
  targets: TeamTarget[];
}

export function useTeam(initial?: Team) {
  return useQuery({ queryKey: hostKeys.team, queryFn: () => api<Team>("/api/host/team"), initialData: initial });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { phone: string; name?: string; scope?: string[] | null }) => api("/api/host/team", { body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hostKeys.team }),
  });
}

export function useSetMemberScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; scope: string[] | null }) => api(`/api/host/team/${v.id}`, { method: "PATCH", body: { scope: v.scope } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hostKeys.team }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/host/team/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hostKeys.team }),
  });
}

export function useUpdateHostProfile() {
  return useMutation({ mutationFn: (patch: Record<string, string>) => api("/api/host/profile", { method: "PATCH", body: patch }) });
}

export function useSwitchHost() {
  return useMutation({ mutationFn: (hostId: string) => api("/api/host/switch", { body: { hostId } }) });
}

// ---------- Operations ----------

const invalidateBookings = (qc: ReturnType<typeof useQueryClient>, id?: string) => {
  qc.invalidateQueries({ queryKey: ["host", "bookings"] });
  qc.invalidateQueries({ queryKey: ["host", "schedule"] });
  qc.invalidateQueries({ queryKey: ["host", "reports"] });
  if (id) qc.invalidateQueries({ queryKey: ["host", "booking", id] });
};

export function useHostSettings(initial?: HostSettings) {
  return useQuery({ queryKey: ["host", "settings"] as const, queryFn: () => api<{ settings: HostSettings }>("/api/host/settings").then((r) => r.settings), initialData: initial });
}

export function useUpdateHostSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<HostSettings>) => api<{ settings: HostSettings }>("/api/host/settings", { method: "PATCH", body: patch }),
    onSuccess: (r) => qc.setQueryData(["host", "settings"], r.settings),
  });
}

export function useHostBookingDetail(id: string | null) {
  return useQuery({
    queryKey: ["host", "booking", id] as const,
    queryFn: () => api<{ detail: HostBookingDetail }>(`/api/host/bookings/${id}`).then((r) => r.detail),
    enabled: !!id,
  });
}

export function useCreateHostBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: HostBookingInput) => api<{ booking: { id: string; code: string } }>("/api/host/bookings", { body: v }), onSuccess: () => invalidateBookings(qc) });
}

export function useBulkSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: BulkScheduleInput) => api<BulkResult>("/api/host/bulk", { body: v }), onSuccess: () => invalidateBookings(qc) });
}

export function useExtendBooking(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: ExtendBookingInput) => api<{ added: number; to: string }>(`/api/host/bookings/${id}/extend`, { body: v }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useAddCharge(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: AddChargeInput) => api<{ amount: number; label: string }>(`/api/host/bookings/${id}/charges`, { body: v }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useRemoveCharge(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (line: number) => api(`/api/host/bookings/${id}/charges/${line}`, { method: "DELETE" }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useSettleDue(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { method: Exclude<PaymentMethod, "online" | "pay_later">; amount?: number }) => api<{ amount: number }>(`/api/host/bookings/${id}/settle`, { body: v }), onSuccess: () => invalidateBookings(qc, id) });
}

/** Pay-at-venue: the guest paid at the desk (full amount). */
export function useMarkPaid(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (method: "cash" | "upi" | "card") => api<{ amount: number }>(`/api/host/bookings/${id}/paid`, { body: { method } }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useMarkNoShow(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api<{ noShows: number }>(`/api/host/bookings/${id}/no-show`, { method: "POST" }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useUndoNoShow(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api<{ noShows: number }>(`/api/host/bookings/${id}/no-show`, { method: "DELETE" }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useHostCancel(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { refundPct?: 0 | 50 | 100; reason?: string; notify?: boolean }) => api<{ refundAmount: number }>(`/api/host/bookings/${id}/cancel`, { body: v }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useHostReschedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { to: { date: string; startMins: number; resourceId?: string } | { sessionId: string }; notify?: boolean }) => api<{ from: string }>(`/api/host/bookings/${id}/reschedule`, { body: v }),
    onSuccess: () => invalidateBookings(qc, id),
  });
}

export function useSetBookingNotes(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (notes: string) => api(`/api/host/bookings/${id}/notes`, { method: "PUT", body: { notes } }), onSuccess: () => invalidateBookings(qc, id) });
}

export function useHostReport(p: { range: ReportRange; from?: string; to?: string; target?: string }) {
  return useQuery<HostReport>({
    queryKey: ["host", "reports", p] as const,
    queryFn: async ({ signal }) => (await api<{ report: HostReport }>(`/api/host/reports${qs(p)}`, { signal })).report,
    placeholderData: keepPreviousData,
  });
}

export function useHostListingInventory(listingId: string | null) {
  return useQuery({
    queryKey: ["host", "inventory", listingId] as const,
    queryFn: () => api<{ sessions: { id: string; label: string; startsAt: string; endsAt: string; remaining: number }[]; tickets: { id: string; name: string; price: number | null; remaining: number; sessionId: string | null; isPass: boolean }[] }>(`/api/host/inventory${qs({ listing: listingId })}`),
    enabled: !!listingId,
  });
}
