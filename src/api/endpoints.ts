import { request, requestData } from './client';
import type {
  Account,
  AiAnswer,
  AiChatMessage,
  AiInsight,
  AiSummary,
  AnalyticsBucket,
  AnalyticsOverview,
  AppNotification,
  CategorySuggestion,
  DeletionSummary,
  MerchantMemory,
  MerchantSuggestion,
  QuickEntryProposal,
  Receipt,
  ReceiptStatus,
  TransactionExport,
  UploadTicket,
  UploadedImage,
  AuthSession,
  BudgetProgress,
  BudgetSummary,
  Category,
  CreateBudgetInput,
  CreateRecurringInput,
  CreateAccountInput,
  CreateTransactionInput,
  PageMeta,
  DailySpend,
  RecurringRule,
  Summary,
  Transaction,
  TransactionFilters,
  UpdateAccountInput,
  UpdateBudgetInput,
  UpdateRecurringInput,
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
  update(patch: {
    name?: string;
    currency?: string;
    timezone?: string;
    notificationPrefs?: { budgetAlerts?: boolean; recurringAlerts?: boolean };
  }) {
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

  /** Spend per local day, for the calendar and the trend strip. */
  daily(range: { from: string; to: string }) {
    return requestData<{ days: DailySpend[] }>('/transactions/daily', { params: range }).then(
      (data) => data.days,
    );
  },
};

// --------------------------------------------------------------------- budgets

export const budgetApi = {
  /**
   * Caps and progress together. There is no bare "list the budgets" call — a cap
   * without what has been spent against it is not something any screen shows.
   */
  summary(month?: string) {
    return requestData<{ summary: BudgetSummary }>('/budgets', { params: { month } }).then(
      (data) => data.summary,
    );
  },

  create(input: CreateBudgetInput) {
    return requestData<{ budget: BudgetProgress }>('/budgets', {
      method: 'POST',
      body: input,
    }).then((data) => data.budget);
  },

  update(id: string, patch: UpdateBudgetInput) {
    return requestData<{ budget: BudgetProgress }>(`/budgets/${id}`, {
      method: 'PATCH',
      body: patch,
    }).then((data) => data.budget);
  },

  remove(id: string) {
    return requestData<{ deleted: boolean }>(`/budgets/${id}`, { method: 'DELETE' });
  },
};

// ------------------------------------------------------------------- recurring

export const recurringApi = {
  list(includeInactive = false) {
    return requestData<{ recurring: RecurringRule[] }>('/recurring', {
      params: { includeInactive: includeInactive ? 'true' : 'false' },
    }).then((data) => data.recurring);
  },

  upcoming(withinDays = 14, limit = 5) {
    return requestData<{ recurring: RecurringRule[] }>('/recurring/upcoming', {
      params: { withinDays, limit },
    }).then((data) => data.recurring);
  },

  get(id: string) {
    return requestData<{ recurring: RecurringRule }>(`/recurring/${id}`).then(
      (data) => data.recurring,
    );
  },

  create(input: CreateRecurringInput) {
    return requestData<{ recurring: RecurringRule }>('/recurring', {
      method: 'POST',
      body: input,
    }).then((data) => data.recurring);
  },

  update(id: string, patch: UpdateRecurringInput) {
    return requestData<{ recurring: RecurringRule }>(`/recurring/${id}`, {
      method: 'PATCH',
      body: patch,
    }).then((data) => data.recurring);
  },

  setPaused(id: string, paused: boolean) {
    return requestData<{ recurring: RecurringRule }>(`/recurring/${id}/pause`, {
      method: 'POST',
      body: { paused },
    }).then((data) => data.recurring);
  },

  remove(id: string) {
    return requestData<{ deleted: boolean }>(`/recurring/${id}`, { method: 'DELETE' });
  },
};

// --------------------------------------------------------------- notifications

export const notificationApi = {
  list(page = 1, limit = 25) {
    return requestData<{ notifications: AppNotification[]; unread: number }>('/notifications', {
      params: { page, limit },
    });
  },

  /** Just the badge. One indexed count, rather than pages nobody is reading. */
  unreadCount() {
    return requestData<{ unread: number }>('/notifications/unread-count').then(
      (data) => data.unread,
    );
  },

  markRead(id: string) {
    return requestData<{ notification: AppNotification }>(`/notifications/${id}/read`, {
      method: 'POST',
    }).then((data) => data.notification);
  },

  markAllRead() {
    return requestData<{ updated: number }>('/notifications/read-all', { method: 'POST' });
  },

  clearAll() {
    return requestData<{ deleted: number }>('/notifications', { method: 'DELETE' });
  },

  registerDevice(token: string) {
    return requestData<{ deleted: boolean }>('/notifications/device', {
      method: 'POST',
      body: { token },
    });
  },
};


// ------------------------------------------------------------------- analytics

export const analyticsApi = {
  overview(range: { from: string; to: string; previousFrom?: string; previousTo?: string; label?: string }) {
    return requestData<{ overview: AnalyticsOverview }>('/analytics/overview', {
      params: range,
    }).then((data) => data.overview);
  },

  trend(months = 6) {
    return requestData<{ months: AnalyticsBucket[] }>('/analytics/trend', {
      params: { months },
    }).then((data) => data.months);
  },
};

// -------------------------------------------------------------------------- ai

export const aiApi = {
  /** Whether the assistant is configured, so the app can explain rather than fail. */
  status() {
    return requestData<{ available: boolean; model: string | null }>('/ai/status');
  },

  /** Summary and insight cards together — both written from one set of figures. */
  summary(range: {
    from: string;
    to: string;
    previousFrom?: string;
    previousTo?: string;
    label?: string;
  }) {
    return requestData<{ summary: AiSummary; insights: AiInsight[] }>('/ai/summary', {
      params: range,
    });
  },

  ask(input: {
    question: string;
    from: string;
    to: string;
    previousFrom?: string;
    previousTo?: string;
    label?: string;
  }) {
    return requestData<{ answer: AiAnswer }>('/ai/ask', { method: 'POST', body: input }).then(
      (data) => data.answer,
    );
  },

  chat(limit = 50) {
    return requestData<{ messages: AiChatMessage[] }>('/ai/chat', { params: { limit } }).then(
      (data) => data.messages,
    );
  },

  clearChat() {
    return requestData<{ deleted: number }>('/ai/chat', { method: 'DELETE' });
  },

  /** Reads one typed line into a proposed transaction. Writes nothing. */
  parse(input: { text: string; type?: 'expense' | 'income' }) {
    return requestData<{ proposal: QuickEntryProposal }>('/ai/parse', {
      method: 'POST',
      body: input,
    }).then((data) => data.proposal);
  },

  /** Suggests a category. Writes nothing — the user always chooses. */
  categorise(input: {
    merchant: string;
    description?: string;
    amount?: number;
    type?: 'expense' | 'income';
  }) {
    return requestData<{ suggestion: CategorySuggestion }>('/ai/categorise', {
      method: 'POST',
      body: input,
    }).then((data) => data.suggestion);
  },
};


// ------------------------------------------------------------------- step 5

export const merchantApi = {
  /** Names this user has used before, most-used first. */
  list(query = '', limit = 8) {
    return requestData<{ merchants: MerchantSuggestion[] }>('/merchants', {
      params: { q: query, limit },
    }).then((data) => data.merchants);
  },

  /** What they usually file one merchant under. No model involved. */
  recall(merchant: string) {
    return requestData<{ memory: MerchantMemory | null }>('/merchants/recall', {
      params: { merchant },
    }).then((data) => data.memory);
  },

  /** The way out of a memory that learned something wrong. */
  forget(merchant: string) {
    return requestData<{ forgotten: number }>('/merchants', {
      method: 'DELETE',
      body: { merchant },
    });
  },
};

export const receiptApi = {
  status() {
    return requestData<ReceiptStatus>('/receipts/status');
  },

  /** Permission to upload one image. Spent immediately, never stored. */
  ticket() {
    return requestData<{ ticket: UploadTicket }>('/receipts/signature', {
      method: 'POST',
    }).then((data) => data.ticket);
  },

  /** Tells our API what Cloudinary stored. It verifies the signature itself. */
  record(input: UploadedImage & { transactionId?: string }) {
    return requestData<{ receipt: Receipt }>('/receipts', {
      method: 'POST',
      body: input,
    }).then((data) => data.receipt);
  },

  list(filter: { transactionId?: string } = {}) {
    return requestData<{ receipts: Receipt[] }>('/receipts', { params: filter }).then(
      (data) => data.receipts,
    );
  },

  /** Reads the image. Applies nothing — the user confirms each field. */
  extract(id: string) {
    return requestData<{ receipt: Receipt }>(`/receipts/${id}/extract`, {
      method: 'POST',
    }).then((data) => data.receipt);
  },

  attach(id: string, transactionId: string | null) {
    return requestData<{ receipt: Receipt }>(`/receipts/${id}/attach`, {
      method: 'POST',
      body: { transactionId },
    }).then((data) => data.receipt);
  },

  remove(id: string) {
    return requestData<{ deleted: boolean }>(`/receipts/${id}`, { method: 'DELETE' });
  },
};


// ------------------------------------------------------------------- step 6

export const dataApi = {
  /** The whole ledger for a window, as CSV. */
  exportTransactions(range: { from: string; to: string }) {
    return requestData<{ export: TransactionExport }>('/transactions/export', {
      params: range,
    }).then((data) => data.export);
  },

  /**
   * Closes the account and deletes everything in it.
   *
   * Password-confirmed on the server. Every session dies with it, so the token
   * that made the call stops working the moment it succeeds — the app has to
   * clear its own state rather than retry anything.
   */
  deleteProfile(password: string) {
    return requestData<{ deleted: DeletionSummary }>('/users/me', {
      method: 'DELETE',
      body: { password, confirm: 'DELETE' },
    }).then((data) => data.deleted);
  },
};
