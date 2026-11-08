'use client';

import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import PortfolioBuilder from '@/components/PortfolioBuilder';
import CurrencySelector from '@/components/CurrencySelector';
import InsightsPanel from '@/components/InsightsPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import AddMenu from '@/components/AddMenu';
import InfoTip from '@/components/InfoTip';
import ShareButton from '@/components/ShareButton';
import CsvButton from '@/components/CsvButton';
import { ChartSkeleton, TableSkeleton } from '@/components/LoadingSkeletons';
import { AnalysisResponse, Asset, Rebalance, analyzePortfolio } from '@/lib/api';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';
import {
  DEFAULT_CURRENCY, DEFAULT_PORTFOLIOS, DEFAULT_START_DATE, PRESET_PORTFOLIOS,
  PortfolioInput, PortfolioResult, fetchComparison, toResult, todayISO,
} from '@/lib/portfolios';
import { getPortfolioColor } from '@/lib/colors';
import { formatPercent } from '@/lib/formatting';
import { UrlStateConfig, alignParam, parseUrlState, serializeUrlState } from '@/lib/urlState';
import type { ExportInput } from '@/lib/csv';
import { useWakeBackend } from '@/hooks/useWakeBackend';
import { usePresetPrefetch } from '@/hooks/usePresetPrefetch';

// Lazy load heavy chart components. The chart is still server-rendered; its
// chunk (with recharts) only has to arrive before it becomes interactive.
const PerformanceChart = lazy(() => import('@/components/PerformanceChart'));
// The allocation donut only shows on hover, so recharts stays out of First Load JS
const loadPortfolioPopover = () => import('@/components/PortfolioPopover');
const PortfolioPopover = lazy(loadPortfolioPopover);
const StatsTable = lazy(() => import('@/components/StatsTable'));

/** Screen-reader text listing a portfolio's holdings (the pie popover is visual). */
const holdingsText = (assets: Asset[]) =>
  `Holdings: ${assets.map((a) => `${a.symbol} ${formatPercent(a.weight, 0)}`).join(', ')}`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ChipSwatch = ({ color }: { color: string }) => (
  <span className="chip-swatch" style={{ background: color }} aria-hidden="true" />
);

interface PortfolioPlaygroundProps {
  /** Default portfolios rendered on the server, or null if that fetch failed. */
  initialResults: PortfolioResult[] | null;
  /** End date the server used, so the client starts on the same range. */
  initialEndDate: string;
}

// PerformanceChart takes a mutable array; copy once rather than every render
const CHART_CURRENCIES = [...SUPPORTED_CURRENCIES];

const CURRENCY_CODES: ReadonlySet<string> = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

/** URL state settings; `today` is the latest end date (and the default one). */
const urlConfig = (today: string): UrlStateConfig => ({
  presets: PRESET_PORTFOLIOS,
  currencies: CURRENCY_CODES,
  defaultStartDate: DEFAULT_START_DATE,
  defaultCurrency: DEFAULT_CURRENCY,
  today,
});

// Debounce for mirroring the view into the address bar
const URL_SYNC_DELAY_MS = 400;

// Mirrors the backend's 25-year limit (MAX_DATE_RANGE_YEARS * 365 days)
const MAX_RANGE_DAYS = 25 * 365;

const RANGE_PRESETS: { label: string; years: number | null }[] = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
  { label: 'Max', years: null },
];

/** Start date `years` before `end` (or the longest range allowed when null). */
function rangeStart(end: string, years: number | null): string {
  const d = new Date(`${end}T00:00:00Z`);
  if (years == null) d.setUTCDate(d.getUTCDate() - MAX_RANGE_DAYS);
  else d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().split('T')[0];
}

/** Turn transport-level errors into something a visitor can act on. */
const friendlyError = (message: string) =>
  /Unable to reach the server/.test(message)
    ? 'The data server is not responding. It may be starting up after a period of inactivity; please try again in a few seconds.'
    : message;

/** Identifies a query: date range, currency, start-date alignment and rebalancing. */
const queryKey = (startDate: string, endDate: string, currency: string, align: boolean, rebalance: Rebalance) =>
  `${startDate}|${endDate}|${currency}|${align ? 'aligned' : ''}|${rebalance}`;

const REBALANCE_OPTIONS: { value: Rebalance; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

/** Portfolios start on different dates: their first shown dates differ. */
const shownStartsDiffer = (list: PortfolioResult[]) =>
  new Set(list.map((r) => r.performance.dates[0])).size > 1;

/** Methodology notes for the CSV export (kept in step with the table footnote). */
const EXPORT_NOTES = [
  'Dividends reinvested (adjusted close prices).',
  'Annualized over calendar time; annualized return needs about a year of data.',
  'Sharpe and Sortino use the average 13-week US T-bill rate when positive.',
  'Non-USD holdings use quoted prices as if in USD (no conversion yet).',
];

/** Portfolios the next refresh loads from scratch, replacing what is shown. */
interface Seed {
  inputs: PortfolioInput[];
  /** Names of shown portfolios this replaces (dropped when the seed loads). */
  replaces: Set<string>;
  /** From a shared link (vs. defaults the server couldn't prefetch). */
  fromUrl: boolean;
}

/** A single-portfolio analysis that hasn't landed in `results` yet. */
interface PendingAnalysis extends PortfolioInput {
  /** Name of the entry this replaces (the original name when editing). */
  replaces: string;
}

/** Inputs after applying a pending add/edit on top of the current portfolios. */
function withPending(base: PortfolioInput[], pending: PendingAnalysis | null): PortfolioInput[] {
  if (!pending) return base;
  const index = base.findIndex((p) => p.name === pending.replaces);
  const entry = { name: pending.name, assets: pending.assets };
  const rest = base.filter((p) => p.name !== pending.replaces && p.name !== pending.name);
  if (index === -1) return [...rest, entry];
  // Keep the edited portfolio in its original position (and color)
  rest.splice(Math.min(index, rest.length), 0, entry);
  return rest;
}

/** Insert `result`, replacing the entry named `replaces` in place if present. */
function upsertResult(
  prev: PortfolioResult[], result: PortfolioResult, replaces: string
): PortfolioResult[] {
  const index = prev.findIndex((r) => r.name === replaces);
  const rest = prev.filter((r) => r.name !== replaces && r.name !== result.name);
  if (index === -1) return [...rest, result];
  rest.splice(Math.min(index, rest.length), 0, result);
  return rest;
}

export default function PortfolioPlayground({ initialResults, initialEndDate }: PortfolioPlaygroundProps) {
  const [results, setResults] = useState<PortfolioResult[]>(initialResults ?? []);
  // Single-portfolio analysis (preset click / modal submit) in flight
  const [analyzing, setAnalyzing] = useState(false);
  // Without server data, the client loads the defaults itself on mount
  const [refreshing, setRefreshing] = useState(initialResults === null);
  const loading = analyzing || refreshing;
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState('');
  // Re-runs the failed request: a single analysis, or a full refresh
  const retryRef = useRef<(() => void) | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [showModal, setShowModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [editingPortfolio, setEditingPortfolio] = useState<PortfolioResult | null>(null);

  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  // "Align start dates": undefined = automatic (on, which only changes
  // anything when portfolios start on different dates); a boolean once the
  // user (or a shared link) chose explicitly
  const [alignMode, setAlignMode] = useState<boolean | undefined>(undefined);
  const align = alignMode ?? true;
  // Rebalancing schedule ('none' = buy-and-hold)
  const [rebalance, setRebalance] = useState<Rebalance>('none');
  // Date the shown results were clipped to by the backend, or null
  const [alignedStart, setAlignedStart] = useState<string | null>(null);
  // Re-fetch everything on the next refresh even if the query is unchanged
  // (a portfolio added or removed changes the common start date)
  const forceRefreshRef = useRef(false);
  // Portfolios to load on the next refresh: the defaults (server prefetch
  // failed) or the portfolios from a shared link
  const seedRef = useRef<Seed | null>(initialResults === null
    ? { inputs: DEFAULT_PORTFOLIOS, replaces: new Set(), fromUrl: false }
    : null);
  // Query (range + currency) a shared link asked for; refreshes wait for it
  const urlKeyRef = useRef<string | null>(null);
  // Don't overwrite the address bar while a shared link is loading (or after
  // it failed), until a load succeeds
  const urlSyncPausedRef = useRef(false);
  // Query that `results` currently reflect. The server renders the defaults
  // unaligned, which equals aligned: they all start on the same date.
  const loadedKeyRef = useRef(queryKey(DEFAULT_START_DATE, initialEndDate, DEFAULT_CURRENCY, true, 'none'));
  // Query currently selected (updated during render, so async callbacks can
  // tell whether their response is still for the current query)
  const currentKey = queryKey(startDate, endDate, currency, align, rebalance);
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const resultsRef = useRef<PortfolioResult[]>(results);
  const analyzeControllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingAnalysis | null>(null);

  // Keep ref in sync with results state
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Wake a sleeping backend in the background, once per session (N-Perf-2)
  useWakeBackend();

  // Load the presets that aren't shown in one batched request once the page
  // is idle, so a preset click can skip the network (C5)
  const shownNames = useMemo(() => results.map((r) => r.name), [results]);
  const presetPrefetch = usePresetPrefetch({
    presets: PRESET_PORTFOLIOS,
    shownNames,
    query: { startDate, endDate, currency, align, rebalance },
    enabled: !loading && results.length > 0 && seedRef.current === null,
  });

  // Fetch the (small) popover chunk once the page is idle, so the first hover
  // doesn't wait on the network. recharts itself arrives with the chart.
  useEffect(() => {
    const prefetch = () => { loadPortfolioPopover().catch(() => {}); };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);

  // Generate next available portfolio name
  const getNextPortfolioName = () => {
    let n = 1;
    while (results.some(r => r.name === `Portfolio ${n}`)) {
      n++;
    }
    return `Portfolio ${n}`;
  };

  const openAddModal = () => {
    setFormError(null);
    setError(null);
    setNewPortfolioName(getNextPortfolioName());
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPortfolio(null);
    setFormError(null);
  };

  /**
   * Analyze one portfolio and add it to the results. `originalName` is the
   * name of the portfolio being edited, so a rename replaces it in place.
   * `prefetched` is a response already loaded for the current query (preset
   * prefetch), used instead of calling /analyze.
   */
  const handleAnalyze = async (
    rawName: string, assets: Asset[], originalName?: string, prefetched?: AnalysisResponse
  ) => {
    const name = rawName.trim();
    if (!name) {
      setFormError('Portfolio name cannot be empty');
      return;
    }
    if (name !== originalName && resultsRef.current.some((r) => r.name === name)) {
      setFormError(`A portfolio named "${name}" already exists. Choose a different name.`);
      return;
    }
    setFormError(null);

    analyzeControllerRef.current?.abort();
    const controller = new AbortController();
    analyzeControllerRef.current = controller;
    const pending: PendingAnalysis = { name, assets, replaces: originalName ?? name };
    pendingRef.current = pending;
    const requestKey = currentKeyRef.current;
    const [requestStart, requestEnd, requestCurrency, , requestRebalance] = requestKey.split('|');

    setAnalyzing(true);
    setError(null);

    try {
      const response = prefetched ?? await analyzePortfolio(
        { name, assets },
        requestStart,
        requestEnd,
        requestCurrency,
        controller.signal,
        requestRebalance as Rebalance
      );
      // The date range or currency changed while this was in flight: the
      // refresh for the new query picks up `pending` instead.
      if (controller.signal.aborted || requestKey !== currentKeyRef.current) return;

      urlSyncPausedRef.current = false;
      const result = toResult({ name, assets }, response);
      setResults((prev) => upsertResult(prev, result, pending.replaces));
      if (pendingRef.current === pending) pendingRef.current = null;
      closeModal();
      // /analyze doesn't align: if the new portfolio starts on a different
      // date than the others, reload everything aligned
      if (align && shownStartsDiffer(upsertResult(resultsRef.current, result, pending.replaces))) {
        forceRefreshRef.current = true;
        setRetryToken((n) => n + 1);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (pendingRef.current === pending) pendingRef.current = null;
      setErrorTitle(`Couldn't add "${name}".`);
      retryRef.current = () => { handleAnalyze(rawName, assets, originalName); };
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (analyzeControllerRef.current === controller) {
        analyzeControllerRef.current = null;
        setAnalyzing(false);
      }
    }
  };

  // Popovers open on hover and on keyboard focus within the chip (incl. the
  // popover's own Edit/Remove buttons); Escape closes them.
  const popoverHandlers = (name: string) => ({
    onMouseEnter: () => setOpenPopover(name),
    onMouseLeave: () => setOpenPopover(null),
    onFocus: () => setOpenPopover(name),
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenPopover(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') setOpenPopover(null);
    },
  });

  const renderPopover = (r: PortfolioResult) => (
    <Suspense fallback={null}>
      <PortfolioPopover
        name={r.name}
        assets={r.assets}
        currencies={r.currencies}
        onEdit={() => handleEditClick(r)}
        onRemove={() => removePortfolio(r.name)}
      />
    </Suspense>
  );

  const addPreset = async (preset: PortfolioInput) => {
    if (results.some((r) => r.name === preset.name)) {
      return;
    }
    const prefetched = presetPrefetch.get(preset, { startDate, endDate, currency, align, rebalance });
    await handleAnalyze(preset.name, preset.assets, undefined, prefetched ?? undefined);
  };

  const removePortfolio = (name: string) => {
    setResults((prev) => prev.filter((r) => r.name !== name));
    setOpenPopover(null);
    // Removing the latest starter moves the common start earlier: reload
    const remaining = resultsRef.current.filter((r) => r.name !== name);
    if (alignedStart && remaining.length > 0) {
      const latest = remaining.map((r) => r.dataStart).sort()[remaining.length - 1];
      if (latest !== alignedStart) {
        forceRefreshRef.current = true;
        setRetryToken((n) => n + 1);
      }
    }
  };

  const handleEditClick = (portfolio: PortfolioResult) => {
    setOpenPopover(null);
    setFormError(null);
    setError(null);
    setEditingPortfolio(portfolio);
  };

  // A shared link: replace the server-rendered defaults with the link's view.
  // Runs before the refresh effect below, which then loads it (once the
  // range/currency state has caught up), so there is no separate fetch.
  useEffect(() => {
    const state = parseUrlState(window.location.search, urlConfig(todayISO()));
    if (!state) return;
    // Nothing usable in the link: fall back to the default portfolios
    const inputs = state.portfolios.length > 0 ? state.portfolios : DEFAULT_PORTFOLIOS;
    const key = queryKey(
      state.startDate, state.endDate, state.currency, state.alignStart ?? true, state.rebalance ?? 'none'
    );
    if (inputs === DEFAULT_PORTFOLIOS && key === loadedKeyRef.current && !seedRef.current) return;

    urlSyncPausedRef.current = true;
    seedRef.current = {
      inputs,
      replaces: new Set(resultsRef.current.map((r) => r.name)),
      fromUrl: true,
    };
    urlKeyRef.current = key;
    setStartDate(state.startDate);
    setEndDate(state.endDate);
    setCurrency(state.currency);
    setAlignMode(state.alignStart);
    setRebalance(state.rebalance ?? 'none');
    setRefreshing(true);
  }, []);

  // (Re-)fetch all portfolios when the date range or currency changes, and
  // load the seed (defaults or a shared link) on mount.
  useEffect(() => {
    const key = queryKey(startDate, endDate, currency, align, rebalance);
    // Wait until the shared link's range/currency are in state
    if (urlKeyRef.current && key !== urlKeyRef.current) return;
    urlKeyRef.current = null;
    const seed = seedRef.current;

    // A single analysis started for the previous query is now stale: stop it
    // and fold its portfolio into this refresh instead.
    analyzeControllerRef.current?.abort();
    analyzeControllerRef.current = null;
    setAnalyzing(false);
    const pending = pendingRef.current;

    const force = forceRefreshRef.current;
    forceRefreshRef.current = false;
    if (key === loadedKeyRef.current && !seed && !pending && !force) {
      // e.g. switched back to the range already shown, cancelling a refresh
      setRefreshing(false);
      return;
    }

    const base: PortfolioInput[] = seed ? seed.inputs : resultsRef.current;
    const inputs = withPending(base, pending);
    if (inputs.length === 0) {
      loadedKeyRef.current = key;
      setAlignedStart(null);
      setRefreshing(false);
      return;
    }

    const controller = new AbortController();

    const refreshPortfolios = async () => {
      setRefreshing(true);
      setError(null);

      try {
        const { results: refreshed, alignedStart: clippedTo } = await fetchComparison(
          inputs, startDate, endDate, currency, controller.signal, align, rebalance
        );
        if (controller.signal.aborted) return;
        setAlignedStart(clippedTo);
        const byName = new Map(refreshed.map((r) => [r.name, r]));

        // Merge rather than replace, so portfolios removed meanwhile stay
        // removed. A seed replaces what it was loaded over, in its own order.
        setResults((prev) => {
          let next = seed
            ? [
              ...refreshed.filter((r) => !pending || r.name !== pending.name),
              ...prev.filter((r) => !byName.has(r.name) && !seed.replaces.has(r.name)),
            ]
            : prev.map((r) => byName.get(r.name) ?? r);
          if (pending) {
            const result = byName.get(pending.name);
            if (result) next = upsertResult(next, result, pending.replaces);
          }
          return next;
        });

        loadedKeyRef.current = key;
        if (seedRef.current === seed) seedRef.current = null;
        urlSyncPausedRef.current = false;
        if (pending && pendingRef.current === pending) {
          pendingRef.current = null;
          closeModal();
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (pending && pendingRef.current === pending) pendingRef.current = null;
        if (seed?.fromUrl) {
          // Keep showing what was there; Retry tries the shared link again
          if (seedRef.current === seed) seedRef.current = null;
          setErrorTitle("Couldn't load the shared portfolios.");
          retryRef.current = () => {
            seedRef.current = seed;
            setRetryToken((n) => n + 1);
          };
        } else {
          setErrorTitle("Couldn't load market data.");
          retryRef.current = () => setRetryToken((n) => n + 1);
        }
        setError(err instanceof Error
          ? err.message
          : seed ? 'Failed to load portfolios' : 'Failed to refresh data');
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false);
        }
      }
    };

    refreshPortfolios();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, currency, align, rebalance, retryToken]);

  const handleRetry = () => {
    const retry = retryRef.current;
    setError(null);
    retry?.();
  };

  /** Query string for the current view ("" for the default view). */
  const currentQuery = () => serializeUrlState(
    {
      portfolios: resultsRef.current.map(({ name, assets }) => ({ name, assets })),
      startDate,
      endDate,
      currency,
      alignStart: alignParam(alignMode, startsDiffer),
      rebalance: rebalance === 'none' ? undefined : rebalance,
    },
    DEFAULT_PORTFOLIOS,
    urlConfig(initialEndDate),
  );

  // Mirror the view into the address bar (replaceState: no history entries)
  useEffect(() => {
    if (seedRef.current || urlSyncPausedRef.current) return;
    const id = setTimeout(() => {
      const { pathname, search, hash } = window.location;
      const query = currentQuery();
      if (query !== search) {
        // Keep Next.js' own history state
        window.history.replaceState(window.history.state, '', `${pathname}${query}${hash}`);
      }
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, startDate, endDate, currency, alignMode, rebalance]);

  const shareUrl = () => `${window.location.origin}${window.location.pathname}${currentQuery()}`;

  const applyRange = (years: number | null) => {
    const today = todayISO();
    setEndDate(today);
    setStartDate(rangeStart(today, years));
  };
  // Derived from the current dates only (not today's date), so the server and
  // client render the same thing even when the cached page is a day old
  const activeRange = RANGE_PRESETS.find((p) => rangeStart(endDate, p.years) === startDate)?.label;

  const chartData = useMemo(() => results.map((r) => ({
    name: r.name,
    performance: r.performance,
  })), [results]);

  const statsData = useMemo(() => results.map((r) => r.stats), [results]);

  // Actual first/last dates covered by the loaded data, for the methodology note
  const dataWindow = useMemo(() => {
    const firsts = results.map((r) => r.performance.dates[0]).filter(Boolean).sort();
    const lasts = results.map((r) => r.performance.dates[r.performance.dates.length - 1]).filter(Boolean).sort();
    if (!firsts.length) return null;
    return {
      start: firsts[0],
      end: lasts[lasts.length - 1],
      // A portfolio's series begins when its newest asset started trading
      staggered: firsts[0] !== firsts[firsts.length - 1],
    };
  }, [results]);
  // Currency the shown results are in (lags the selector while a refresh runs)
  const loadedCurrency = loadedKeyRef.current.split('|')[2];
  // Rebalancing the shown results were computed with
  const loadedRebalance = loadedKeyRef.current.split('|')[4] as Rebalance;

  // Each portfolio's real data window; the align control only shows when they differ
  const windows = useMemo(() => results.map((r) => ({ name: r.name, start: r.dataStart, end: r.dataEnd })), [results]);
  const startsDiffer = new Set(windows.map((w) => w.start)).size > 1;

  // Non-USD trading currencies among the holdings (shown as "not converted")
  const unconvertedCurrencies = useMemo(() => Array.from(new Set(
    results.flatMap((r) => Object.values(r.currencies))
      .filter((c): c is string => c != null && c !== 'USD')
  )).sort(), [results]);

  const exportInput = (): ExportInput => ({
    portfolios: resultsRef.current,
    currency: loadedCurrency,
    startDate,
    endDate,
    alignedStart,
    rebalance: loadedRebalance,
    notes: EXPORT_NOTES,
    url: shareUrl(),
  });

  const modalOpen = showModal || editingPortfolio !== null;

  // Dialog focus management: move focus in on open, return it on close
  const modalRef = useRef<HTMLDivElement>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (modalOpen) {
      const active = document.activeElement;
      modalTriggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      // Start on the first field (the name), not the header's close button
      const first = modalRef.current?.querySelector<HTMLElement>('input:not([disabled])')
        ?? modalRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    } else if (modalTriggerRef.current) {
      const trigger = modalTriggerRef.current;
      modalTriggerRef.current = null;
      // The trigger may be gone (e.g. a popover's Edit button); fall back to "+ Custom Portfolio"
      (trigger.isConnected ? trigger : document.querySelector<HTMLElement>('.add-custom-btn'))?.focus();
    }
  }, [modalOpen]);

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeModal();
      return;
    }
    if (e.key !== 'Tab' || !modalRef.current) return;
    // Trap focus inside the dialog
    const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const firstLoad = loading && results.length === 0;
  const showEmpty = !loading && results.length === 0;
  // Shown results don't match the selected range/currency: loading, or the
  // refresh failed (an error with Retry is shown above)
  const isStale = results.length > 0 && (loading || loadedKeyRef.current !== currentKey);

  return (
    <main className="container">
      <div className="top-card">
        {/* Row 1: Title left + Controls right */}
        <div className="top-card-row1">
          <div className="top-card-title">
            <h1>Portfolio Playground</h1>
            <div className="header-subtitle">
              <span>Build, analyze, and compare investment portfolios</span>
              <a className="header-link header-link-about" href="https://jianchao.xyz/projects/portfolio-playground/" target="_blank" rel="noopener noreferrer">About</a>
              <a className="header-link header-link-source" href="https://github.com/jianchao-li/portfolio-playground" target="_blank" rel="noopener noreferrer">Source Code</a>
              <InfoTip
                label="Disclaimer"
                trigger="Disclaimer"
                triggerClassName="disclaimer-link"
                wrapperClassName="disclaimer-wrapper"
                tooltipClassName="disclaimer-tooltip"
              >
                <span className="disclaimer-tooltip-content">
                  <strong>Disclaimer</strong>
                  <span>For informational and educational purposes only — not financial advice. The author is not a financial advisor, and use of this tool does not create an advisory relationship. Data may be inaccurate, delayed, or incomplete. The author assumes no liability for any losses or damages arising from reliance on information provided. Consult a qualified financial professional before making investment decisions.</span>
                </span>
              </InfoTip>
            </div>
          </div>
          <div className="top-card-controls">
            <div className="date-inputs">
              <div className="date-field range-field">
                <span className="date-field-label">Range</span>
                <div className="range-presets" role="group" aria-label="Date range shortcuts">
                  {RANGE_PRESETS.map(({ label, years }) => (
                    <button
                      key={label}
                      type="button"
                      className={activeRange === label ? 'range-preset active' : 'range-preset'}
                      aria-pressed={activeRange === label}
                      onClick={() => applyRange(years)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="date-field">
                <label htmlFor="start-date">Start</label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  min={rangeStart(endDate, null)}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="date-field">
                <label htmlFor="end-date">End</label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="date-field rebalance-field">
                <label htmlFor="rebalance">Rebalance</label>
                <select
                  id="rebalance"
                  value={rebalance}
                  onChange={(e) => setRebalance(e.target.value as Rebalance)}
                  title="Reset to target weights on the first trading day of each period (no costs)"
                >
                  {REBALANCE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <CurrencySelector
                value={currency}
                onChange={setCurrency}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Portfolio chips */}
        <div className="top-card-row2">
          <div className="portfolio-chips-custom">
            <button
              type="button"
              onClick={openAddModal}
              className="add-custom-btn"
            >
              + Custom Portfolio
            </button>

            {/* Custom portfolios (not matching any preset) */}
            {results
              .filter((r) => !PRESET_PORTFOLIOS.some((p) => p.name === r.name))
              .map((r) => {
                const resultIndex = results.findIndex((res) => res.name === r.name);
                const color = getPortfolioColor(resultIndex);
                const holdingsId = `holdings-custom-${resultIndex}`;
                return (
                  <div
                    key={r.name}
                    className="portfolio-chip-wrapper"
                    {...popoverHandlers(r.name)}
                  >
                    <span className="portfolio-chip-unified active">
                      <ChipSwatch color={color} />
                      <button
                        type="button"
                        className="chip-name"
                        aria-label={`Edit ${r.name}`}
                        aria-describedby={holdingsId}
                        onClick={() => handleEditClick(r)}
                      >
                        {r.name}
                      </button>
                      <span id={holdingsId} className="sr-only">{holdingsText(r.assets)}</span>
                      <button
                        type="button"
                        className="chip-remove"
                        onClick={() => removePortfolio(r.name)}
                        aria-label={`Remove ${r.name}`}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </span>
                    {openPopover === r.name && renderPopover(r)}
                  </div>
                );
              })}
          </div>

          <div className="portfolio-chips-right">
          <span className="preset-label">Presets:</span>
          {PRESET_PORTFOLIOS.map((preset, presetIndex) => {
            const resultIndex = results.findIndex((r) => r.name === preset.name);
            const isActive = resultIndex !== -1;
            const holdingsId = `holdings-preset-${presetIndex}`;
            const holdings = <span id={holdingsId} className="sr-only">{holdingsText(preset.assets)}</span>;

            if (isActive) {
              const r = results[resultIndex];
              return (
                <div
                  key={preset.name}
                  className="portfolio-chip-wrapper"
                  {...popoverHandlers(r.name)}
                >
                  <button
                    type="button"
                    onClick={() => removePortfolio(preset.name)}
                    disabled={loading}
                    className="portfolio-chip-unified active"
                    aria-pressed={true}
                    aria-describedby={holdingsId}
                  >
                    <ChipSwatch color={getPortfolioColor(resultIndex)} />
                    {preset.name}
                  </button>
                  {holdings}
                  {openPopover === r.name && renderPopover(r)}
                </div>
              );
            }

            return (
              <div
                key={preset.name}
                className="portfolio-chip-wrapper preset-inactive"
                {...popoverHandlers(preset.name)}
              >
                <button
                  type="button"
                  onClick={() => addPreset(preset)}
                  disabled={loading}
                  className="portfolio-chip-unified inactive"
                  aria-pressed={false}
                  aria-describedby={holdingsId}
                >
                  <span aria-hidden="true">+ </span>{preset.name}
                </button>
                {holdings}
                {openPopover === preset.name && (
                  <Suspense fallback={null}>
                    <PortfolioPopover
                      name={preset.name}
                      assets={preset.assets}
                    />
                  </Suspense>
                )}
              </div>
            );
          })}
          {/* Narrow screens: inactive presets and "Custom" live in this menu */}
          <AddMenu
            label="+ Add"
            className="add-menu-mobile"
            items={[
              ...PRESET_PORTFOLIOS
                .filter((preset) => !results.some((r) => r.name === preset.name))
                .map((preset) => ({
                  key: preset.name,
                  label: preset.name,
                  disabled: loading,
                  onSelect: () => { addPreset(preset); },
                })),
              { key: '__custom', label: 'Custom portfolio…', onSelect: openAddModal, separated: true },
            ]}
          />
          </div>
        </div>
      </div>

      {/* Error Message (shown inside the modal instead while it is open) */}
      {error && !modalOpen && (
        <div className="error-message" role="alert">
          <p><strong>{errorTitle}</strong> {friendlyError(error)}</p>
          <div className="error-actions">
            {retryRef.current && (
              <button type="button" onClick={handleRetry} disabled={loading}>Retry</button>
            )}
            <button type="button" className="error-dismiss" aria-label="Dismiss error" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        </div>
      )}

      {/* Performance Chart & Statistics Table */}
      <h2 className="sr-only">Results</h2>
      <ErrorBoundary label="the results" resetKey={results}>
      {showEmpty ? (
        <div className="results-card empty-state">
          <h2>No portfolios selected</h2>
          <p>Pick a preset or build your own portfolio to see its historical growth, returns, volatility, and drawdowns.</p>
          <div className="empty-state-actions">
            {PRESET_PORTFOLIOS.slice(0, 3).map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="portfolio-chip-unified inactive"
                onClick={() => addPreset(preset)}
              >
                + {preset.name}
              </button>
            ))}
            <button type="button" className="add-custom-btn" onClick={openAddModal}>
              + Custom Portfolio
            </button>
          </div>
        </div>
      ) : (
      <div className={isStale ? 'results-row is-stale' : 'results-row'} aria-busy={loading}>
        {loading && <div className="results-progress" aria-hidden="true" />}
        <p className="sr-only" role="status" aria-live="polite">
          {loading && !firstLoad ? 'Updating results…' : ''}
        </p>
        <div className="results-card results-card-chart">
          {firstLoad ? (
            <ChartSkeleton message="Fetching market data. The first load can take a moment." />
          ) : (
            <Suspense fallback={<ChartSkeleton />}>
              <PerformanceChart
                data={chartData}
                currency={currency}
                currencies={CHART_CURRENCIES}
                highlightedIndex={highlightedIndex}
                rebalance={loadedRebalance}
                headerAction={(
                  <div className="chart-actions">
                    <CsvButton getInput={exportInput} disabled={isStale} />
                    <ShareButton getUrl={shareUrl} />
                  </div>
                )}
              />
            </Suspense>
          )}
        </div>

        <div className="results-card results-card-table">
          {firstLoad ? (
            <TableSkeleton />
          ) : (
            <Suspense fallback={<TableSkeleton />}>
              <StatsTable
                stats={statsData}
                onHighlight={setHighlightedIndex}
                dataWindow={dataWindow}
                currency={loadedCurrency}
                alignedStart={alignedStart}
                align={startsDiffer ? {
                  checked: align,
                  onChange: setAlignMode,
                  disabled: loading,
                  windows,
                } : null}
                unconvertedCurrencies={unconvertedCurrencies}
                rebalance={loadedRebalance}
              />
            </Suspense>
          )}
        </div>
      </div>
      )}

      </ErrorBoundary>

      {/* AI Insights Panel */}
      <div className="insights-row">
        <ErrorBoundary label="AI insights" resetKey={statsData}>
          <InsightsPanel portfolios={statsData} />
        </ErrorBoundary>
      </div>

      {/* Modal for Custom/Edit Portfolio */}
      {(showModal || editingPortfolio) && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            ref={modalRef}
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="portfolio-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
          >
            <div className="modal-header">
              <h2 id="portfolio-modal-title">{editingPortfolio ? 'Edit Portfolio' : 'Add Custom Portfolio'}</h2>
              <button type="button" className="modal-close" aria-label="Close dialog" onClick={closeModal}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {(formError || error) && (
              <div className="error-message" role="alert">
                <p>{formError ?? (<><strong>{errorTitle}</strong> {friendlyError(error ?? '')}</>)}</p>
              </div>
            )}
            <PortfolioBuilder
              onSubmit={(name, assets) => handleAnalyze(name, assets, editingPortfolio?.name)}
              loading={loading}
              initialName={editingPortfolio?.name ?? newPortfolioName}
              initialAssets={editingPortfolio?.assets}
              submitLabel={editingPortfolio ? 'Update Portfolio' : undefined}
            />
          </div>
        </div>
      )}

      <footer className="copyright">
        © 2026 Jianchao Li
      </footer>
    </main>
  );
}
