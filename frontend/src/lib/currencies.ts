import type { CurrencyInfo } from '@/lib/api';
import currencyList from './currencies.json';

/**
 * Currencies the backend supports, shipped with the frontend so the page
 * doesn't need a request to the backend on load.
 *
 * Source of truth is SUPPORTED_CURRENCIES in backend/app/services/currency.py.
 * `npm run check:currencies` (scripts/check-currencies.mjs) fails if the two
 * drift apart.
 */
export const SUPPORTED_CURRENCIES: readonly CurrencyInfo[] = currencyList;
