"use client";

import { AnimatePresence, m } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { Area, Category } from "@/contracts";
import type { SearchResult } from "@/services/discover";
import { useListings, type ListingQuery } from "@/lib/api/hooks";
import { addDays, dateStripParts, formatDate, todayIST, weekdayOf } from "@/lib/time";
import { formatINR } from "@/lib/pricing";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import { ListingCard, ListingCardSkeleton } from "./listing-card";

export interface ExplorerFilters {
  when?: string;
  price?: string;
  min?: string;
  max?: string;
  area?: string;
  sort?: string;
  q?: string;
  kind?: string;
}
const KEYS = ["when", "price", "min", "max", "area", "sort", "q", "kind"] as const;

const SORTS = [
  { id: "relevance", label: "Relevance" },
  { id: "soonest", label: "Soonest" },
  { id: "price-low", label: "Price: low to high" },
  { id: "price-high", label: "Price: high to low" },
  { id: "newest", label: "Newest" },
];
const PRICE_CAP = 3000;
const PRICE_STEP = 100;
/** Legacy price ids (home chips, shared links) → slider range */
const LEGACY: Record<string, [number, number]> = { "under-500": [0, 500], "500-1500": [500, 1500], "1500-plus": [1500, PRICE_CAP] };

export interface Crumb {
  name: string;
  path: string;
}

/**
 * Category listing (wireframe 07) and search (wireframe 06), sharing one filter sheet.
 * Filters live in the URL so results are shareable.
 */
export function Explorer({
  city,
  cityName,
  category,
  sub,
  subcategories,
  areas,
  initial,
  initialFilters,
  showDates = true,
  searchMode = false,
  title,
  blurb,
  crumbs,
}: {
  city: string;
  cityName: string;
  category?: Category;
  sub?: Category | null;
  subcategories: Category[];
  areas: Area[];
  initial?: SearchResult;
  initialFilters: ExplorerFilters;
  showDates?: boolean;
  searchMode?: boolean;
  title?: string;
  blurb?: string;
  crumbs?: Crumb[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useState<ExplorerFilters>(initialFilters);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ExplorerFilters>(initialFilters);
  const [qInput, setQInput] = useState(initialFilters.q ?? "");

  const query: ListingQuery = { city, category: category?.slug, sub: sub?.slug, ...filters };
  const isInitial = JSON.stringify(filters) === JSON.stringify(initialFilters);
  const enabled = !searchMode || !!filters.q || !!filters.when || !!filters.price || !!filters.area || !!filters.max || !!filters.min;
  const { data, error, isPending, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useListings(query, {
    initial: isInitial ? initial : undefined,
    enabled,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const facets = data?.pages[0]?.facets;

  // "Show N results" previews the draft without applying it.
  const draftQuery: ListingQuery = { city, category: category?.slug, sub: sub?.slug, ...draft, pageSize: 1 };
  const preview = useListings(draftQuery, { enabled: sheetOpen });
  const previewTotal = preview.data?.pages[0]?.total;

  // Keep the URL shareable without a full navigation.
  const sync = (next: ExplorerFilters) => {
    setFilters(next);
    const sp = new URLSearchParams(params.toString());
    for (const k of KEYS) {
      if (next[k]) sp.set(k, next[k]!);
      else sp.delete(k);
    }
    const s = sp.toString();
    startTransition(() => router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false }));
  };

  // Debounced search input
  useEffect(() => {
    if (!searchMode) return;
    const t = setTimeout(() => {
      if ((qInput || undefined) !== filters.q) sync({ ...filters, q: qInput.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && hasNextPage && !isFetchingNextPage && fetchNextPage(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const days = useMemo(() => {
    const today = todayIST();
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i);
      const p = dateStripParts(d);
      return { id: d, top: i === 0 ? "Today" : p.weekday, bottom: p.day, weekend: [0, 6].includes(weekdayOf(d)) };
    });
  }, []);

  const hasPrice = !!(filters.price || filters.min || filters.max);
  const activeCount = [filters.when && searchMode ? filters.when : undefined, hasPrice || undefined, filters.area, filters.sort && filters.sort !== "relevance" ? filters.sort : undefined].filter(Boolean).length;
  const base = `/${city}/${category?.slug ?? ""}`;
  const noun = category ? (category.slug === "sports" ? "venues" : category.name.toLowerCase()) : "results";
  const whenLabel = filters.when && /^\d{4}-/.test(filters.when) ? formatDate(filters.when) : WHEN_LABEL[filters.when ?? ""];

  const openSheet = () => {
    setDraft(filters);
    setSheetOpen(true);
  };
  const filterButton = (
    <button
      type="button"
      onClick={openSheet}
      aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
      className={cn("relative grid size-11 flex-none place-items-center rounded-full border bg-surface transition-colors", activeCount ? "border-brand text-brand" : "border-line text-ink hover:border-line-strong")}
    >
      <SlidersHorizontal className="size-5" strokeWidth={1.8} aria-hidden />
      {activeCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-[18px] place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{activeCount}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {searchMode ? (
        <div className="flex items-center gap-2.5 px-5 md:px-0">
          <BackButton href={`/${city}`} className="md:hidden" />
          <h1 className="sr-only">Search in {cityName}</h1>
          <label className="relative flex h-[46px] flex-1 items-center gap-2 rounded-[14px] border-2 border-brand bg-surface px-3 md:h-14">
            <span className="sr-only">Search</span>
            <Search className="size-5 flex-none text-muted max-md:hidden" aria-hidden />
            <input
              autoFocus
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Comedy, pickleball, pottery…"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
              enterKeyHint="search"
              type="search"
            />
            {qInput && (
              <button type="button" onClick={() => setQInput("")} className="grid size-8 place-items-center rounded-full bg-field" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </label>
          {filterButton}
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-5 md:px-0">
          {crumbs && (
            <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-sm text-muted max-md:hidden">
              {crumbs.map((c, i) => (
                <span key={c.path} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3.5" />}
                  {i < crumbs.length - 1 ? (
                    <Link href={c.path} className="hover:text-ink">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="text-ink">{c.name}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="flex h-11 items-center gap-1.5 md:h-auto md:items-end md:gap-4">
            <BackButton href={crumbs && crumbs.length > 2 ? crumbs[crumbs.length - 2].path : `/${city}`} className="-ml-2.5 md:hidden" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-2xl font-extrabold md:text-4xl">{title}</h1>
              {blurb && <p className="mt-1 text-muted max-md:hidden">{blurb}</p>}
            </div>
            {filterButton}
          </div>
        </div>
      )}

      {searchMode && enabled && (
        <div className="flex gap-2 px-5 md:px-0" role="group" aria-label="Show">
          {[
            { id: undefined, label: "All", n: facets ? facets.event + facets.venue : undefined },
            { id: "venue", label: "Courts", n: facets?.venue },
            { id: "event", label: "Events", n: facets?.event },
          ].map((t) => (
            <Chip key={t.label} active={filters.kind === t.id} onClick={() => sync({ ...filters, kind: t.id })} className="h-[38px] px-3.5 text-[13px]">
              {t.label}
              {t.n !== undefined && ` · ${t.n}`}
            </Chip>
          ))}
        </div>
      )}

      {showDates && !searchMode && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 md:px-0" role="radiogroup" aria-label="Date">
          <DayButton active={!filters.when} onClick={() => sync({ ...filters, when: undefined })} top="All" bottom="Dates" small />
          {days.map((d) => (
            <DayButton key={d.id} active={filters.when === d.id} onClick={() => sync({ ...filters, when: d.id })} top={d.top} bottom={d.bottom} weekend={d.weekend} />
          ))}
        </div>
      )}

      {subcategories.length > 0 && (
        <nav aria-label="Sub-categories" className="no-scrollbar flex gap-2 overflow-x-auto px-5 md:px-0">
          <SubChip href={`${base}${params.toString() ? `?${params}` : ""}`} active={!sub}>
            All
          </SubChip>
          {subcategories.map((s) => (
            <SubChip key={s.id} href={`${base}/${s.slug}${params.toString() ? `?${params}` : ""}`} active={sub?.id === s.id}>
              {s.name}
            </SubChip>
          ))}
        </nav>
      )}

      <p className={cn("px-5 text-[13px] text-muted md:px-0", searchMode && "sr-only")} aria-live="polite">
        {enabled ? (
          isPending ? (
            "Loading…"
          ) : (
            <>
              <b className="text-ink">
                {total} {total === 1 ? noun.replace(/s$/, "") : noun}
              </b>
              {whenLabel ? ` · ${whenLabel}` : ""}
            </>
          )
        ) : (
          "Start typing to search"
        )}
        {isFetching && !isPending && !isFetchingNextPage ? " · updating" : ""}
      </p>

      {error ? (
        <div className="px-5 md:px-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : !enabled ? (
        <SearchSuggestions cityName={cityName} onPick={(q) => setQInput(q)} />
      ) : isPending ? (
        <Grid rows={searchMode}>
          {Array.from({ length: 6 }, (_, i) => (
            <ListingCardSkeleton key={i} layout={searchMode ? "row" : "feature"} />
          ))}
        </Grid>
      ) : items.length === 0 ? (
        <div className="px-5 md:px-0">
          <EmptyState
            title="Nothing matches that"
            body="Try another date, or clear a filter or two."
            action={
              <Button variant="secondary" size="sm" onClick={() => sync({ q: filters.q })}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Grid rows={searchMode}>
            <AnimatePresence initial={false}>
              {items.map((c, i) => (
                <m.div
                  key={c.id}
                  layout="position"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i % 12, 8) * 0.03 } }}
                  exit={{ opacity: 0 }}
                >
                  <ListingCard card={c} layout={searchMode ? "row" : "feature"} priority={i < 2} />
                </m.div>
              ))}
            </AnimatePresence>
          </Grid>
          <div ref={sentinel} className="h-1" />
          {isFetchingNextPage && (
            <Grid rows={searchMode}>
              {Array.from({ length: 2 }, (_, i) => (
                <ListingCardSkeleton key={i} layout={searchMode ? "row" : "feature"} />
              ))}
            </Grid>
          )}
          {!hasNextPage && items.length > 8 && <p className="py-6 text-center text-sm text-subtle">That&apos;s everything for now.</p>}
        </>
      )}

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        draft={draft}
        setDraft={setDraft}
        areas={areas}
        previewTotal={previewTotal}
        previewLoading={preview.isFetching}
        onApply={() => {
          sync(draft);
          setSheetOpen(false);
        }}
      />
    </div>
  );
}

const WHEN_LABEL: Record<string, string> = { today: "Today", tomorrow: "Tomorrow", weekend: "This weekend", week: "This week" };

function BackButton({ href, className }: { href: string; className?: string }) {
  return (
    <Link href={href} aria-label="Back" className={cn("grid size-11 flex-none place-items-center text-ink", className)}>
      <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
    </Link>
  );
}

function DayButton({ active, onClick, top, bottom, weekend, small }: { active: boolean; onClick: () => void; top: string; bottom: string; weekend?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex h-16 w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-colors duration-200",
        active ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <span className={cn("text-[11px] font-semibold", active ? "text-white/90" : weekend ? "text-brand" : "text-muted")}>{top}</span>
      <span className={cn("font-display font-bold leading-tight", small ? "text-sm" : "text-[19px]")}>{bottom}</span>
    </button>
  );
}

function SubChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:border-ink/30",
      )}
    >
      {children}
    </Link>
  );
}

function Grid({ children, rows }: { children: React.ReactNode; rows?: boolean }) {
  return (
    <>
      <h2 className="sr-only">Results</h2>
      <div className={cn("grid grid-cols-1 px-5 md:px-0", rows ? "gap-3 lg:grid-cols-2 lg:gap-x-5" : "gap-y-6 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3")}>{children}</div>
    </>
  );
}

function FilterSheet({
  open,
  onOpenChange,
  draft,
  setDraft,
  areas,
  previewTotal,
  previewLoading,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: ExplorerFilters;
  setDraft: (f: ExplorerFilters) => void;
  areas: Area[];
  previewTotal: number | undefined;
  previewLoading: boolean;
  onApply: () => void;
}) {
  const [allAreas, setAllAreas] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const legacy = draft.price && LEGACY[draft.price];
  const lo = draft.min ? Number(draft.min) : legacy ? legacy[0] : 0;
  const hi = draft.max ? Number(draft.max) : legacy ? legacy[1] : PRICE_CAP;
  const freeOnly = draft.price === "free";
  const dateValue = draft.when && /^\d{4}-/.test(draft.when) ? draft.when : "";
  const count = [draft.when, draft.price || draft.min || draft.max, draft.area, draft.sort && draft.sort !== "relevance" ? draft.sort : undefined].filter(Boolean).length;
  const setRange = (a: number, b: number) =>
    setDraft({ ...draft, price: undefined, min: a > 0 ? String(a) : undefined, max: b < PRICE_CAP ? String(b) : undefined });
  const shownAreas = allAreas ? areas : areas.slice(0, 5);
  const today = todayIST();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      titleExtra={count > 0 ? <span className="rounded-[10px] bg-tint px-2 py-0.5 font-sans text-[13px] text-brand-ink">{count}</span> : null}
      action={
        <button type="button" onClick={() => setDraft({ q: draft.q, kind: draft.kind })} className="py-2.5 text-sm font-semibold text-brand">
          Clear all
        </button>
      }
      footer={
        <Button size="lg" block onClick={onApply} className="font-bold">
          {previewTotal === undefined || previewLoading ? "Show results" : previewTotal === 0 ? "No results" : `Show ${previewTotal} ${previewTotal === 1 ? "result" : "results"}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <FilterGroup label="When">
          {(["today", "tomorrow", "weekend"] as const).map((w) => (
            <Chip key={w} active={draft.when === w} onClick={() => setDraft({ ...draft, when: draft.when === w ? undefined : w })} className="h-[38px] px-3.5 text-[13px]">
              {WHEN_LABEL[w]}
            </Chip>
          ))}
          <Chip active={!!dateValue || pickDate} onClick={() => setPickDate((v) => !v)} className="h-[38px] px-3.5 text-[13px]">
            {dateValue ? formatDate(dateValue) : "Pick dates"}
          </Chip>
          {(pickDate || dateValue) && (
            <input
              type="date"
              aria-label="Pick a date"
              min={today}
              max={addDays(today, 60)}
              value={dateValue}
              onChange={(e) => setDraft({ ...draft, when: e.target.value || undefined })}
              className="h-[38px] rounded-full border border-line-strong bg-surface px-3.5 text-[13px] font-semibold"
            />
          )}
        </FilterGroup>

        <fieldset className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-bold">Price</legend>
            <span className="text-[13px] font-bold text-brand">{freeOnly ? "Free only" : `${formatINR(lo)} – ${formatINR(hi)}${hi >= PRICE_CAP ? "+" : ""}`}</span>
          </div>
          <PriceRange lo={lo} hi={hi} disabled={freeOnly} onChange={setRange} />
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={freeOnly}
              onChange={(e) => setDraft({ ...draft, price: e.target.checked ? "free" : undefined, min: undefined, max: undefined })}
              className="size-5 accent-[var(--color-brand)]"
            />
            Free only
          </label>
        </fieldset>

        {areas.length > 0 && (
          <FilterGroup label="Area">
            {shownAreas.map((a) => (
              <Chip key={a.id} active={draft.area === a.slug} onClick={() => setDraft({ ...draft, area: draft.area === a.slug ? undefined : a.slug })} className="h-[38px] px-3.5 text-[13px]">
                {a.name}
              </Chip>
            ))}
            {!allAreas && areas.length > 5 && (
              <Chip onClick={() => setAllAreas(true)} className="h-[38px] px-3.5 text-[13px]" aria-label={`Show ${areas.length - 5} more areas`}>
                + {areas.length - 5}
              </Chip>
            )}
          </FilterGroup>
        )}

        <FilterGroup label="Sort by">
          {SORTS.map((s) => (
            <Chip key={s.id} active={(draft.sort ?? "relevance") === s.id} onClick={() => setDraft({ ...draft, sort: s.id === "relevance" ? undefined : s.id })} className="h-[38px] px-3.5 text-[13px]">
              {s.label}
            </Chip>
          ))}
        </FilterGroup>
      </div>
    </Sheet>
  );
}

/** Two thumbs on one track (two overlaid range inputs keep native keyboard + screen reader support). */
function PriceRange({ lo, hi, disabled, onChange }: { lo: number; hi: number; disabled: boolean; onChange: (lo: number, hi: number) => void }) {
  const pct = (v: number) => (v / PRICE_CAP) * 100;
  const thumb =
    "pointer-events-none absolute inset-0 h-[26px] w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-[26px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-brand [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-brand [&::-moz-range-thumb]:bg-white";
  return (
    <div className={cn("relative h-[26px]", disabled && "opacity-40")}>
      <div className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-tint" />
      <div className="absolute top-2.5 h-1.5 rounded-full bg-brand" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
      <input type="range" aria-label="Minimum price" min={0} max={PRICE_CAP} step={PRICE_STEP} value={lo} disabled={disabled} onChange={(e) => onChange(Math.min(Number(e.target.value), hi - PRICE_STEP), hi)} className={thumb} />
      <input type="range" aria-label="Maximum price" min={0} max={PRICE_CAP} step={PRICE_STEP} value={hi} disabled={disabled} onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo + PRICE_STEP))} className={thumb} />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

const SUGGESTIONS = ["Comedy", "Pickleball", "Pottery", "Jazz", "Run club", "Quiz", "Football", "Yoga", "Festival", "Free"];

function SearchSuggestions({ cityName, onPick }: { cityName: string; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-3 px-5 md:px-0">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Popular in {cityName}</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Chip key={s} onClick={() => onPick(s.toLowerCase())}>
            {s}
          </Chip>
        ))}
      </div>
    </div>
  );
}
