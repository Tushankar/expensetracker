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
  aiApi,
  analyticsApi,
  authApi,
  budgetApi,
  dataApi,
  merchantApi,
  receiptApi,
  categoryApi,
  notificationApi,
  recurringApi,
  transactionApi,
  userApi,
  peopleApi,
  moneyOwedApi,
} from './endpoints';
import { queryKeys } from './queryClient';
import { fileFromUri, uploadToCloudinary } from './uploads';
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
  UpdateNotificationPreferences,
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

  return {
    ...query,
    transactions,
    total: query.data?.pages[0]?.meta.total ?? 0,
    summary: query.data?.pages[0]?.summary,
  };
}

export function useParseSearchQuery() {
  return useMutation({
    mutationFn: (query: string) => transactionApi.searchParse(query),
  });
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

export function useNotificationPreferences() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    enabled: status === 'signedIn',
    queryFn: () => notificationApi.getPreferences(),
  });
}

export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateNotificationPreferences) => notificationApi.updatePreferences(patch),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.notificationPreferences, data);
      client.invalidateQueries({ queryKey: queryKeys.notificationPreferences });
      client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useRunAlerts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.runAlerts(),
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


// ------------------------------------------------------------------- analytics

export function useAnalytics(range: {
  from: string;
  to: string;
  previousFrom?: string;
  previousTo?: string;
  label?: string;
}) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.analytics(range),
    enabled: status === 'signedIn',
    queryFn: () => analyticsApi.overview(range),
  });
}

export function useMonthlyTrend(months = 6) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.trend(months),
    enabled: status === 'signedIn',
    staleTime: 5 * 60_000,
    queryFn: () => analyticsApi.trend(months),
  });
}

// -------------------------------------------------------------------------- ai

export function useAiStatus() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.aiStatus,
    enabled: status === 'signedIn',
    // Configuration does not change while the app is open.
    staleTime: Infinity,
    queryFn: () => aiApi.status(),
  });
}

/**
 * The summary and insight cards.
 *
 * A longer `staleTime` than the rest of the app on purpose: every refetch is a
 * Groq call, and re-narrating the same figures because someone switched tabs is
 * a cost with no benefit. The numbers underneath come from the analytics query,
 * which refreshes normally.
 */
export function useAiSummary(range: {
  from: string;
  to: string;
  previousFrom?: string;
  previousTo?: string;
  label?: string;
}) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.aiSummary(range),
    enabled: status === 'signedIn',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    queryFn: () => aiApi.summary(range),
  });
}

export function useAiChat() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.aiChat,
    enabled: status === 'signedIn',
    queryFn: () => aiApi.chat(),
  });
}

export function useAskAi() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      question: string;
      from: string;
      to: string;
      previousFrom?: string;
      previousTo?: string;
      label?: string;
    }) => aiApi.ask(input),
    // The server writes both turns to the transcript, so the history is the
    // source of truth rather than whatever the screen happens to be holding.
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.aiChat }),
  });
}

export function useClearAiChat() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => aiApi.clearChat(),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.aiChat }),
  });
}

/**
 * Asks for a category suggestion.
 *
 * A mutation rather than a query because it is a side-effect-free request the
 * user triggers, not state the screen subscribes to — and because nothing should
 * fire it automatically on every keystroke of a merchant field.
 */
export function useSuggestCategory() {
  return useMutation({
    mutationFn: (input: {
      merchant: string;
      description?: string;
      amount?: number;
      type?: 'expense' | 'income';
    }) => aiApi.categorise(input),
  });
}


// ------------------------------------------------------------------- step 5

/**
 * Reads one typed line into a proposed transaction.
 *
 * A mutation rather than a query: it is an action someone takes, not state a
 * screen subscribes to, and nothing should fire it on every keystroke.
 */
export function useParseQuickEntry() {
  return useMutation({
    mutationFn: (input: { text: string; type?: 'expense' | 'income' }) => aiApi.parse(input),
  });
}

export function useReceiptStatus() {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.receiptStatus,
    enabled: status === 'signedIn',
    // Configuration does not change while the app is open.
    staleTime: Infinity,
    queryFn: () => receiptApi.status(),
  });
}

export function useReceipts(transactionId: string | undefined) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.receipts(transactionId),
    enabled: status === 'signedIn' && Boolean(transactionId),
    queryFn: () => receiptApi.list({ transactionId }),
  });
}

/**
 * The whole upload, as one mutation: ticket, transfer, record.
 *
 * Kept together because the three steps are meaningless apart — a ticket nobody
 * spends is nothing, and an image Cloudinary holds that our API never heard of is
 * worse than nothing. Progress is reported through the caller's callback because
 * it arrives during the mutation rather than at the end of it.
 */
export function useUploadReceipt() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      uri: string;
      mimeType?: string | null;
      transactionId?: string;
      onProgress?: (fraction: number) => void;
    }) => {
      const ticket = await receiptApi.ticket();
      const uploaded = await uploadToCloudinary(ticket, fileFromUri(input.uri, input.mimeType), {
        onProgress: input.onProgress,
      });
      return receiptApi.record({ ...uploaded, transactionId: input.transactionId });
    },
    onSuccess: (receipt) => {
      void client.invalidateQueries({ queryKey: queryKeys.receipts(receipt.transactionId ?? undefined) });
    },
  });
}

export function useExtractReceipt() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => receiptApi.extract(id),
    onSuccess: (receipt) => {
      void client.invalidateQueries({ queryKey: queryKeys.receipts(receipt.transactionId ?? undefined) });
    },
  });
}

export function useAttachReceipt() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; transactionId: string | null }) =>
      receiptApi.attach(input.id, input.transactionId),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['receipts'] }),
  });
}

export function useDeleteReceipt() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => receiptApi.remove(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['receipts'] }),
  });
}

/** Merchant names this user has used, for the entry field. */
export function useMerchantSuggestions(query: string, enabled = true) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.merchants(query),
    enabled: status === 'signedIn' && enabled,
    staleTime: 60_000,
    queryFn: () => merchantApi.list(query),
  });
}


// ------------------------------------------------------------------- step 6

export function useExportTransactions() {
  return useMutation({
    mutationFn: (range: { from: string; to: string }) => dataApi.exportTransactions(range),
  });
}

/**
 * Closes the user's profile, then empties the app.
 *
 * Named `Profile` rather than `Account` because an Account in this app is a bank
 * account — `useDeleteAccount` already exists and archives one of those. Two
 * destructive hooks a letter apart is how someone deletes the wrong thing.
 *
 * The cache is cleared rather than invalidated: invalidating would refetch, and
 * every one of those requests would now 401 against a user that no longer exists.
 */
export function useDeleteProfile() {
  const client = useQueryClient();
  const signOut = useAuthStore((state) => state.signOut);

  return useMutation({
    mutationFn: (password: string) => dataApi.deleteProfile(password),
    onSuccess: async () => {
      await signOut();
      client.clear();
    },
  });
}

// ------------------------------------------------------------------- Phase B.5

function invalidatePeopleAndObligations(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['people'] }),
    client.invalidateQueries({ queryKey: ['moneyOwed'] }),
    client.invalidateQueries({ queryKey: queryKeys.accounts }),
  ]).then(() => undefined);
}

export function usePeople(search?: string) {
  return useQuery({
    queryKey: queryKeys.people(search),
    queryFn: () => peopleApi.list(search),
  });
}

export function usePeopleSummary() {
  return useQuery({
    queryKey: queryKeys.peopleSummary,
    queryFn: () => peopleApi.summary(),
  });
}

export function usePerson(id: string) {
  return useQuery({
    queryKey: queryKeys.person(id),
    queryFn: () => peopleApi.get(id),
    enabled: Boolean(id),
  });
}

export function useCreatePerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: import('./types').CreatePersonInput) => peopleApi.create(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useUpdatePerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<import('./types').CreatePersonInput> }) =>
      peopleApi.update(id, patch),
    onSuccess: (_, { id }) => {
      void client.invalidateQueries({ queryKey: ['people'] });
      void client.invalidateQueries({ queryKey: queryKeys.person(id) });
    },
  });
}

export function useDeletePerson() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => peopleApi.delete(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useMoneyOwedList(filters?: { personId?: string; direction?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.moneyOwed(filters),
    queryFn: () => moneyOwedApi.list(filters),
  });
}

export function useMoneyOwed(id: string) {
  return useQuery({
    queryKey: queryKeys.moneyOwedDetail(id),
    queryFn: () => moneyOwedApi.get(id),
    enabled: Boolean(id),
  });
}

export function useRepayments(obligationId: string) {
  return useQuery({
    queryKey: queryKeys.repayments(obligationId),
    queryFn: () => moneyOwedApi.listRepayments(obligationId),
    enabled: Boolean(obligationId),
  });
}

export function useCreateMoneyOwed() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: import('./types').CreateMoneyOwedInput) => moneyOwedApi.create(input),
    onSuccess: () => invalidatePeopleAndObligations(client),
  });
}

export function useRecordRepayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: import('./types').RecordRepaymentInput;
    }) => moneyOwedApi.recordRepayment(id, input),
    onSuccess: (_, { id }) => {
      void invalidatePeopleAndObligations(client);
      void client.invalidateQueries({ queryKey: queryKeys.repayments(id) });
    },
  });
}

export function useWriteOffObligation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => moneyOwedApi.writeOff(id, note),
    onSuccess: () => invalidatePeopleAndObligations(client),
  });
}

export function useDeleteMoneyOwed() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => moneyOwedApi.delete(id),
    onSuccess: () => invalidatePeopleAndObligations(client),
  });
}
