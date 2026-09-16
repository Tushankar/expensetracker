import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { useAuthStore } from '@/store/authStore';

import {
  accountApi,
  authApi,
  budgetApi,
  categoryApi,
  notificationApi,
  recurringApi,
  transactionApi,
  userApi,
} from './endpoints';
import { queryKeys } from './queryClient';
import type {
  Account,
  AuthSession,
  Category,
  CreateAccountInput,
  CreateBudgetInput,
  CreateRecurringInput,
  CreateTransactionInput,
  Transaction,
  TransactionFilters,
  UpdateAccountInput,
  UpdateBudgetInput,
  UpdateRecurringInput,
  UpdateTransactionInput,
} from './types';

/**
 * A write to the ledger moves three things at once: the transaction list, the
 * account balances it debited or credited, and the month's totals. Invalidating
 * all three together is what stops the Home screen showing a balance that
 * disagrees with the row the user just added.
 */
function invalidateLedger(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.transactions }),
    client.invalidateQueries({ queryKey: queryKeys.accounts }),
  ]).then(() => undefined);
}

// --------------------------------------------------------------------- session

/**
 * Re-reads the signed-in user from the server.
 *
 * The store already restored a cached copy from the keychain, so this is not what
 * gets the app on screen — it is what corrects a stale name, and what notices that
 * the account was deleted or the session revoked elsewhere.
 */
export function useSession() {
  const status = useAuthStore((state) => state.status);
  const updateUser = useAuthStore((state) => state.updateUser);

  return useQuery({
    queryKey: queryKeys.session,
    enabled: status === 'signedIn',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { user } = await authApi.me();
      await updateUser(user);
      return user;
    },
  });
}

export function useLogin() {
  const signIn = useAuthStore((state) => state.signIn);
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { email: string; password: string }) => authApi.login(input),
    async onSuccess(session: AuthSession) {
      // Clear first. Whatever is cached belongs to whoever was signed in before,
      // and on a shared device that is someone else's money.
      client.clear();
      await signIn(session);
    },
  });
}

export function useRegister() {
  const signIn = useAuthStore((state) => state.signIn);
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; currency?: string }) =>
      authApi.register(input),
    async onSuccess(session: AuthSession) {
      client.clear();
      await signIn(session);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();

  return useMutation({
    async mutationFn() {
      const { refreshToken, signOut } = useAuthStore.getState();
      // Revoking server-side is best-effort: if the network is down the local
      // session must still end, because the user asked it to.
      if (refreshToken) {
        await authApi.logout(refreshToken).catch(() => undefined);
      }
      await signOut();
    },
    onSuccess() {
      client.clear();
    },
  });
}

export function useUpdateProfile() {
  const updateUser = useAuthStore((state) => state.updateUser);
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: {
      name?: string;
      currency?: string;
      timezone?: string;
      notificationPrefs?: { budgetAlerts?: boolean; recurringAlerts?: boolean };
    }) => userApi.update(patch),
    async onSuccess({ user }) {
      await updateUser(user);
      await client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      userApi.changePassword(input.currentPassword, input.newPassword),
  });
}

// -------------------------------------------------------------------- accounts

export function useAccounts(includeArchived = false) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: [...queryKeys.accounts, includeArchived],
    enabled: status === 'signedIn',
    queryFn: () => accountApi.list(includeArchived),
  });
}

/** Account lookup by id, for rendering a row's account name without a second fetch. */
export function useAccountMap(): Map<string, Account> {
  const { data } = useAccounts(true);
  return useMemo(
    () => new Map((data ?? []).map((account) => [account.id, account])),
    [data],
  );
}

export function useCreateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => accountApi.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateAccountInput }) =>
      accountApi.update(input.id, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}

export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accountApi.remove(id),
    onSuccess: () => invalidateLedger(client),
  });
}

// ------------------------------------------------------------------ categories

export function useCategories(type?: 'expense' | 'income') {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.categories(type),
    enabled: status === 'signedIn',
    // The default tree is ~110 rows that almost never change; refetching it on
    // every screen mount would be pure noise.
    staleTime: 10 * 60_000,
    queryFn: () => categoryApi.list(type),
  });
}

export function useCategoryMap(): Map<string, Category> {
  const { data } = useCategories();
  return useMemo(
    () => new Map((data?.categories ?? []).map((category) => [category.id, category])),
    [data],
  );
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      group: string;
      type: 'expense' | 'income';
      icon?: string;
      color?: string;
    }) => categoryApi.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoryApi.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ---------------------------------------------------------------- transactions

const PAGE_SIZE = 25;

/**
 * The paginated transaction list.
 *
 * Infinite rather than page-numbered because the UI is a scrolling ledger: pages
 * are an implementation detail the user never sees, and the server's `hasMore`
 * decides when to stop.
 */
export function useTransactions(filters: TransactionFilters = {}) {
  const status = useAuthStore((state) => state.status);

  return useInfiniteQuery({
    queryKey: queryKeys.transactionList(filters),
    enabled: status === 'signedIn',
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      transactionApi.list({ ...filters, page: pageParam, limit: filters.limit ?? PAGE_SIZE }, signal),
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.page + 1 : undefined),
  });
}

/** Flattens the infinite query's pages into the list a screen actually renders. */
export function useTransactionList(filters: TransactionFilters = {}) {
  const query = useTransactions(filters);

  const transactions = useMemo(
    () => query.data?.pages.flatMap((page) => page.transactions) ?? [],
    [query.data],
  );

  return { ...query, transactions, total: query.data?.pages[0]?.meta.total ?? 0 };
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transaction(id ?? 'none'),
    enabled: Boolean(id),
    queryFn: () => transactionApi.get(id as string),
  });
}

export function useSummary(range: { from?: string; to?: string } = {}) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.summary(range),
    enabled: status === 'signedIn',
    queryFn: () => transactionApi.summary(range),
  });
}

export function useCreateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => transactionApi.create(input),
    onSuccess: () => invalidateLedger(client),
  });
}

export function useUpdateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateTransactionInput }) =>
      transactionApi.update(input.id, input.patch),
    async onSuccess(transaction: Transaction) {
      client.setQueryData(queryKeys.transaction(transaction.id), transaction);
      await invalidateLedger(client);
    },
  });
}

export function useDeleteTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transactionApi.remove(id),
    async onSuccess(_result, id) {
      client.removeQueries({ queryKey: queryKeys.transaction(id) });
      await invalidateLedger(client);
    },
  });
}

// --------------------------------------------------------------------- budgets

/**
 * Budgets are always a calendar month, even when the dashboard is showing a week
 * or a custom range. A cap is a monthly promise; prorating it to "₹1,615 so far
 * this week" would be arithmetic nobody asked for and nobody trusts.
 */
export function useBudgets(month?: string) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.budgets(month),
    enabled: status === 'signedIn',
    queryFn: () => budgetApi.summary(month),
  });
}

export function useCreateBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetInput) => budgetApi.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useUpdateBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateBudgetInput }) =>
      budgetApi.update(input.id, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export function useDeleteBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => budgetApi.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

// ------------------------------------------------------------------- recurring

export function useRecurring(includeInactive = false) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.recurring(includeInactive),
    enabled: status === 'signedIn',
    queryFn: () => recurringApi.list(includeInactive),
  });
}

export function useUpcomingRecurring(withinDays = 14, limit = 4) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.recurringUpcoming(withinDays, limit),
    enabled: status === 'signedIn',
    queryFn: () => recurringApi.upcoming(withinDays, limit),
  });
}

/**
 * A rule writes transactions, so every mutation has to invalidate the ledger too
 * — creating one with a start date in the past records a charge immediately, and
 * Home would otherwise show a balance that disagrees with the list under it.
 */
function invalidateRecurring(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['recurring'] }),
    client.invalidateQueries({ queryKey: ['budgets'] }),
    invalidateLedger(client),
  ]).then(() => undefined);
}

export function useCreateRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecurringInput) => recurringApi.create(input),
    onSuccess: () => invalidateRecurring(client),
  });
}

export function useUpdateRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: UpdateRecurringInput }) =>
      recurringApi.update(input.id, input.patch),
    onSuccess: () => invalidateRecurring(client),
  });
}

export function usePauseRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; paused: boolean }) =>
      recurringApi.setPaused(input.id, input.paused),
    onSuccess: () => invalidateRecurring(client),
  });
}

export function useDeleteRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recurringApi.remove(id),
    onSuccess: () => invalidateRecurring(client),
  });
}

// --------------------------------------------------------------- notifications

export function useNotifications() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.notifications,
    enabled: status === 'signedIn',
    queryFn: () => notificationApi.list(),
  });
}

/**
 * The badge on the bell.
 *
 * Polled rather than pushed, because push is not wired up yet. A minute is often
 * enough to notice a budget alert without being a background request every few
 * seconds, and it is a count rather than the list.
 */
export function useUnreadCount() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.unreadCount,
    enabled: status === 'signedIn',
    queryFn: () => notificationApi.unreadCount(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function invalidateNotifications(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.notifications }),
    client.invalidateQueries({ queryKey: queryKeys.unreadCount }),
  ]);
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => invalidateNotifications(client),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => invalidateNotifications(client),
  });
}

export function useClearNotifications() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.clearAll(),
    onSuccess: () => invalidateNotifications(client),
  });
}

// -------------------------------------------------------------- daily spending

export function useDailySpend(range: { from: string; to: string }) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.daily(range),
    enabled: status === 'signedIn',
    queryFn: () => transactionApi.daily(range),
  });
}

// -------------------------------------------------------------- timezone sync

/**
 * Keeps the account's stored zone in step with the device.
 *
 * The server computes budget months, recurring dates and daily buckets in the
 * zone on the user's record, while the app computes its own period boundaries
 * from the device. If those two disagree, an 11pm expense on the 31st lands in
 * one month on the dashboard and a different one in the budget — with nothing on
 * screen to explain the discrepancy.
 *
 * Runs once per launch, only when they actually differ, and failure is silent:
 * a zone that could not be saved is not worth an error banner over.
 */
export function useTimezoneSync(): void {
  const status = useAuthStore((state) => state.status);
  const storedZone = useAuthStore((state) => state.user?.timezone);
  const updateUser = useAuthStore((state) => state.updateUser);
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== 'signedIn' || !storedZone || attempted.current) return;

    let deviceZone: string | undefined;
    try {
      deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      // Some Hermes builds ship without a zone database. Leaving the stored one
      // alone is the right answer — it is at worst stale, not wrong.
      return;
    }

    if (!deviceZone || deviceZone === storedZone) return;

    attempted.current = true;
    userApi
      .update({ timezone: deviceZone })
      .then(({ user }) => updateUser(user))
      .catch(() => undefined);
  }, [status, storedZone, updateUser]);
}
