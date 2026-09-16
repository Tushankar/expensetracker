import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuthStore } from '@/store/authStore';

import { accountApi, authApi, categoryApi, transactionApi, userApi } from './endpoints';
import { queryKeys } from './queryClient';
import type {
  Account,
  AuthSession,
  Category,
  CreateAccountInput,
  CreateTransactionInput,
  Transaction,
  TransactionFilters,
  UpdateAccountInput,
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
    mutationFn: (patch: { name?: string; currency?: string }) => userApi.update(patch),
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
