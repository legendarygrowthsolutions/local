"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HostApplicationInput, HostMember, ListingInput } from "@/contracts";
import type { HostBookingRow, HostListingRow } from "@/services/host";
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
      api<{ id: string; status: string }>(id ? `/api/host/listings/${id}` : "/api/host/listings", { method: id ? "PUT" : "POST", body: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hostKeys.listings }),
  });
}

export function useHostListings(initial?: HostListingRow[]) {
  return useQuery({ queryKey: hostKeys.listings, queryFn: () => api<{ items: HostListingRow[] }>("/api/host/listings").then((r) => r.items), initialData: initial });
}

export function useHostBookings(p: { when: string; target?: string; q?: string }) {
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
  booking: { code: string; customer: string; status: string } | null;
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

export function useTeam(initial?: HostMember[]) {
  return useQuery({ queryKey: hostKeys.team, queryFn: () => api<{ items: HostMember[] }>("/api/host/team").then((r) => r.items), initialData: initial });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { phone: string; name?: string }) => api("/api/host/team", { body: v }),
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
