"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AvailabilityPayload, Booking, City, HoldRequest, PayRequest, ProfileInput } from "@/contracts";
import type { PublicUser } from "@/services/users";
import type { BookingView } from "@/services/bookings";
import type { SearchResult } from "@/services/discover";
import { api, qs } from "./client";

export const keys = {
  me: ["me"] as const,
  cities: ["cities"] as const,
  listings: (p: Record<string, unknown>) => ["listings", p] as const,
  availability: (venueId: string, sport?: string, date?: string) => ["availability", venueId, sport, date] as const,
  myBookings: ["me", "bookings"] as const,
  booking: (id: string) => ["booking", id] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<{ user: PublicUser | null }>("/api/me").then((r) => r.user),
    staleTime: 60_000,
  });
}

export function useCities() {
  return useQuery({ queryKey: keys.cities, queryFn: () => api<{ items: City[] }>("/api/cities").then((r) => r.items), staleTime: Infinity });
}

export interface ListingQuery {
  city: string;
  category?: string;
  sub?: string;
  when?: string;
  price?: string;
  area?: string;
  sort?: string;
  q?: string;
  kind?: string;
  min?: string;
  max?: string;
  pageSize?: number;
}

export function useListings(params: ListingQuery, opts: { enabled?: boolean; initial?: SearchResult } = {}) {
  return useInfiniteQuery({
    queryKey: keys.listings({ ...params }),
    queryFn: ({ pageParam, signal }) => api<SearchResult>(`/api/listings${qs({ ...params, page: pageParam })}`, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: opts.enabled ?? true,
    initialData: opts.initial ? { pages: [opts.initial], pageParams: [1] } : undefined,
    staleTime: 30_000,
  });
}

export function useAvailability(venueId: string, sport?: string, date?: string) {
  return useQuery({
    queryKey: keys.availability(venueId, sport, date),
    queryFn: ({ signal }) => api<AvailabilityPayload>(`/api/venues/${venueId}/availability${qs({ sport, date })}`, { signal }),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
    enabled: !!venueId,
  });
}

export function useSendOtp() {
  return useMutation({
    mutationFn: (v: { phone: string; channel?: "sms" | "whatsapp" }) =>
      api<{ sent: boolean; resendInSec: number; channel: "sms" | "whatsapp"; devCode?: string }>("/api/auth/otp/send", { body: { phone: v.phone, channel: v.channel ?? "sms" } }),
  });
}

export function useVerifyOtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { phone: string; code: string }) => api<{ user: PublicUser; isNew: boolean }>("/api/auth/otp/verify", { body: v }),
    onSuccess: (r) => qc.setQueryData(keys.me, r.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(keys.me, null);
      qc.removeQueries({ queryKey: keys.myBookings });
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ProfileInput> & { cityId?: string; avatar?: string | null; notifications?: PublicUser["notifications"] }) => api<{ user: PublicUser }>("/api/me", { method: "PATCH", body: patch }),
    onSuccess: (r) => qc.setQueryData(keys.me, r.user),
  });
}

export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ saved: string[]; isSaved: boolean }>("/api/me/saved", { body: { id } }),
    onMutate: async (id) => {
      const prev = qc.getQueryData<PublicUser | null>(keys.me);
      if (prev) qc.setQueryData(keys.me, { ...prev, saved: prev.saved.includes(id) ? prev.saved.filter((x) => x !== id) : [...prev.saved, id] });
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(keys.me, ctx.prev),
    onSuccess: (r) => {
      const prev = qc.getQueryData<PublicUser | null>(keys.me);
      if (prev) qc.setQueryData(keys.me, { ...prev, saved: r.saved });
    },
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hostId: string) => api<{ following: string[]; isFollowing: boolean }>("/api/me/following", { body: { hostId } }),
    onMutate: async (hostId) => {
      const prev = qc.getQueryData<PublicUser | null>(keys.me);
      if (prev) qc.setQueryData(keys.me, { ...prev, following: prev.following.includes(hostId) ? prev.following.filter((x) => x !== hostId) : [...prev.following, hostId] });
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(keys.me, ctx.prev),
    onSuccess: (r) => {
      const prev = qc.getQueryData<PublicUser | null>(keys.me);
      if (prev) qc.setQueryData(keys.me, { ...prev, following: r.following });
    },
  });
}

export function useHold() {
  return useMutation({ mutationFn: (req: HoldRequest) => api<{ booking: Booking }>("/api/bookings/hold", { body: req }).then((r) => r.booking) });
}

export function useBooking(id: string, initial?: BookingView) {
  return useQuery({
    queryKey: keys.booking(id),
    queryFn: () => api<{ booking: BookingView }>(`/api/bookings/${id}`).then((r) => r.booking),
    initialData: initial,
  });
}

export function usePay<R extends PayRequest = PayRequest>(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: R) => api<{ outcome: "success" | "failed" | "refunded"; booking: Booking }>(`/api/bookings/${id}/pay`, { body: req }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.booking(id) });
      qc.invalidateQueries({ queryKey: keys.myBookings });
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useMyBookings() {
  return useQuery({
    queryKey: keys.myBookings,
    queryFn: () => api<{ upcoming: BookingView[]; past: BookingView[]; cancelled: BookingView[] }>("/api/me/bookings"),
  });
}

export function useCancelBooking(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ booking: Booking; refundAmount: number }>(`/api/bookings/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.booking(id) });
      qc.invalidateQueries({ queryKey: keys.myBookings });
    },
  });
}

export function useUpdateAttendee(id: string) {
  return useMutation({
    mutationFn: (attendee: NonNullable<Booking["attendee"]>) => api<{ booking: Booking }>(`/api/bookings/${id}/attendee`, { body: attendee }).then((r) => r.booking),
  });
}

export function useApplyCoupon(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string | null) => api<{ booking: Booking }>(`/api/bookings/${id}/coupon`, { body: { code } }).then((r) => r.booking),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.booking(id) }),
  });
}
