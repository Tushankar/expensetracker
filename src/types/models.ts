/**
 * Money is stored as an integer number of paise, never as a float of rupees.
 * 0.1 + 0.2 !== 0.3 in IEEE-754, and a ledger that drifts by a paisa is a ledger
 * nobody trusts. The API speaks the same unit, so nothing converts in the middle;
 * format at the edge with `formatINR`.
 */
export type Paise = number;

/**
 * What a summary card needs, assembled from the API's `/transactions/summary`.
 *
 * Note what is here and what is not: income, expense and the previous period's
 * figures, all of which the server aggregates exactly. There is no time series,
 * because the API does not return one and a chart drawn from whichever page of
 * transactions happened to be loaded would be a chart of the scroll position.
 *
 * `transferred` is carried alongside rather than folded into either total —
 * moving ₹10,000 from HDFC to Cash is not income and not spending, and the card
 * shows it separately so the number is visible rather than merely absent.
 */
export type PeriodSummary = {
  /** Start of the period, ISO. */
  from: string;
  /** End of the period, ISO. */
  to: string;
  label: string;
  income: Paise;
  spent: Paise;
  /** income − spent. Can be negative. */
  saved: Paise;
  transferred: Paise;
  previousIncome: Paise;
  previousSpent: Paise;
  /** Sum of every active account. */
  currentBalance: Paise;
};

/** One band of the spending donut, already resolved to a label and a colour. */
export type CategorySlice = {
  key: string;
  label: string;
  color: string;
  amount: Paise;
  /** 0–1 share of the period's total spend. */
  share: number;
};
