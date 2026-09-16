import { QueryClient } from '@tanstack/react-query';

import { ApiError, NetworkError } from './errors';

/**
 * Keys are built from a path so an invalidation can be as broad or as narrow as
 * the change warrants: adding a transaction invalidates `['transactions']` and
 * every filtered list under it, while editing one account touches only its own.
 */
export const queryKeys = {
  session: ['session'] as const,
  accounts: ['accounts'] as const,
  account: (id: string) => ['accounts', id] as const,
  categories: (type?: string) => ['categories', type ?? 'all'] as const,
  transactions: ['transactions'] as const,
  transactionList: (filters: Record<string, unknown>) => ['transactions', 'list', filters] as const,
  transaction: (id: string) => ['transactions', 'detail', id] as const,
  summary: (range: Record<string, unknown>) => ['transactions', 'summary', range] as const,
};

/**
 * Retrying a 400 sends the same invalid request again; retrying a 401 races the
 * refresh the client is already doing; retrying a 404 cannot conjure the row. Only
 * a network failure is worth another go, and twice is enough to ride out a tunnel
 * or a Wi-Fi handover without leaving someone watching a spinner.
 */
function retry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (error instanceof NetworkError) return failureCount < 2;
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
        // Long enough that moving between tabs is instant, short enough that a
        // transaction added on another device shows up without a manual refresh.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // The cached data renders immediately and the refetch happens behind it,
        // so returning to a screen never flashes a spinner over content that is
        // already correct.
        refetchOnMount: true,
      },
      mutations: {
        // A write that failed may well have succeeded server-side. Retrying could
        // book the same expense twice, which is worse than showing an error.
        retry: false,
      },
    },
  });
}
