import { request, requestData } from './client';
import type {
  Account,
  AuthSession,
  Category,
  CreateAccountInput,
  CreateTransactionInput,
  PageMeta,
  Summary,
  Transaction,
  TransactionFilters,
  UpdateAccountInput,
  UpdateTransactionInput,
  User,
} from './types';

/**
 * Every endpoint the app talks to, in one file.
 *
 * Nothing here caches, retries or holds state — that is React Query's job. These
 * are the thin typed edge between the two.
 */

// ------------------------------------------------------------------------ auth

export const authApi = {
  register(input: { name: string; email: string; password: string; currency?: string }) {
    return requestData<AuthSession>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
  },

  login(input: { email: string; password: string }) {
    return requestData<AuthSession>('/auth/login', { method: 'POST', body: input, auth: false });
  },

  logout(refreshToken: string) {
    return requestData<{ deleted: boolean }>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
    });
  },

  me() {
    return requestData<{ user: User }>('/auth/me');
  },
};

// ----------------------------------------------------------------------- users

export const userApi = {
  update(patch: { name?: string; currency?: string }) {
    return requestData<{ user: User }>('/users/me', { method: 'PATCH', body: patch });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return requestData<{ deleted: boolean }>('/users/me/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },
};

// -------------------------------------------------------------------- accounts

export const accountApi = {
  list(includeArchived = false) {
    return requestData<{ accounts: Account[] }>('/accounts', {
      params: { includeArchived: includeArchived ? 'true' : 'false' },
    }).then((data) => data.accounts);
  },

  get(id: string) {
    return requestData<{ account: Account }>(`/accounts/${id}`).then((data) => data.account);
  },

  create(input: CreateAccountInput) {
    return requestData<{ account: Account }>('/accounts', { method: 'POST', body: input }).then(
      (data) => data.account,
    );
  },

  update(id: string, patch: UpdateAccountInput) {
    return requestData<{ account: Account }>(`/accounts/${id}`, {
      method: 'PATCH',
      body: patch,
    }).then((data) => data.account);
  },

  remove(id: string) {
    return requestData<{ deleted: boolean; archived: boolean }>(`/accounts/${id}`, {
      method: 'DELETE',
    });
  },
};

// ------------------------------------------------------------------ categories

export const categoryApi = {
  list(type?: 'expense' | 'income' | 'transfer') {
    return requestData<{ categories: Category[]; groups: string[] }>('/categories', {
      params: { type },
    });
  },

  create(input: { name: string; group: string; type: 'expense' | 'income'; icon?: string; color?: string }) {
    return requestData<{ category: Category }>('/categories', {
      method: 'POST',
      body: input,
    }).then((data) => data.category);
  },

  update(id: string, patch: { name?: string; group?: string; icon?: string; color?: string }) {
    return requestData<{ category: Category }>(`/categories/${id}`, {
      method: 'PATCH',
      body: patch,
    }).then((data) => data.category);
  },

  remove(id: string) {
    return requestData<{ deleted: boolean; archived: boolean }>(`/categories/${id}`, {
      method: 'DELETE',
    });
  },
};

// ---------------------------------------------------------------- transactions

export const transactionApi = {
  async list(
    filters: TransactionFilters = {},
    signal?: AbortSignal,
  ): Promise<{ transactions: Transaction[]; meta: PageMeta }> {
    const result = await request<{ transactions: Transaction[] }>('/transactions', {
      params: filters as Record<string, string | number | undefined>,
      signal,
    });
    return {
      transactions: result.data.transactions,
      meta: (result.meta ?? {
        page: 1,
        limit: filters.limit ?? 25,
        total: result.data.transactions.length,
        totalPages: 1,
        hasMore: false,
      }) as PageMeta,
    };
  },

  get(id: string) {
    return requestData<{ transaction: Transaction }>(`/transactions/${id}`).then(
      (data) => data.transaction,
    );
  },

  create(input: CreateTransactionInput) {
    return requestData<{ transaction: Transaction }>('/transactions', {
      method: 'POST',
      body: input,
    }).then((data) => data.transaction);
  },

  update(id: string, patch: UpdateTransactionInput) {
    return requestData<{ transaction: Transaction }>(`/transactions/${id}`, {
      method: 'PATCH',
      body: patch,
    }).then((data) => data.transaction);
  },

  remove(id: string) {
    return requestData<{ deleted: boolean }>(`/transactions/${id}`, { method: 'DELETE' });
  },

  summary(range: { from?: string; to?: string } = {}) {
    return requestData<{ summary: Summary }>('/transactions/summary', { params: range }).then(
      (data) => data.summary,
    );
  },
};
