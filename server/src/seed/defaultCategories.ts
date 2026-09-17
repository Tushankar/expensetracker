import type { CategoryType } from '../modules/categories/category.model';

export type SeedCategory = {
  name: string;
  /** Name from the mobile icon registry. */
  icon: string;
};

export type SeedGroup = {
  group: string;
  type: CategoryType;
  /** Hue key from the mobile palette — the client resolves it to a colour. */
  color: string;
  items: readonly SeedCategory[];
};

/**
 * The category tree every new account starts with, written for India rather than
 * translated into it.
 *
 * Two levels, because that is how people describe money here: "food" is a budget,
 * "Swiggy" is where it went, and a flat list of ninety names is unusable in a
 * picker. Brands are first-class — Swiggy, Zomato, Ola, Rapido, Netflix are what
 * shows on a statement, and asking someone to file a Swiggy order under
 * "Restaurants" is asking them to do the app's job.
 *
 * Fuel is split by what goes in the tank, alcohol and tobacco get their own group
 * rather than hiding inside Entertainment, and Financial covers the EMI/SIP side of
 * a household ledger that a Western default set leaves out entirely.
 */
export const DEFAULT_CATEGORIES: readonly SeedGroup[] = [
  {
    group: 'Food',
    type: 'expense',
    color: 'food',
    items: [
      { name: 'Restaurants', icon: 'food' },
      { name: 'Lunch', icon: 'food' },
      { name: 'Dinner', icon: 'food' },
      { name: 'Snacks', icon: 'food' },
      { name: 'Street Food', icon: 'flame' },
      { name: 'Fast Food', icon: 'food' },
      { name: 'Tea & Chai', icon: 'coffee' },
      { name: 'Cafe', icon: 'coffee' },
      { name: 'Swiggy', icon: 'package' },
      { name: 'Zomato', icon: 'package' },
      { name: 'Sweets & Bakery', icon: 'cake' },
      { name: 'Food Delivery', icon: 'package' },
    ],
  },
  {
    group: 'Grocery',
    type: 'expense',
    color: 'grocery',
    items: [
      { name: 'Grocery', icon: 'grocery' },
      { name: 'Vegetables', icon: 'leaf' },
      { name: 'Fruits', icon: 'leaf' },
      { name: 'Milk & Dairy', icon: 'milk' },
      { name: 'Meat & Chicken', icon: 'meat' },
      { name: 'Fish', icon: 'meat' },
      { name: 'Snacks & Namkeen', icon: 'food' },
      { name: 'Household', icon: 'home' },
      { name: 'Personal Care', icon: 'sparkles' },
      { name: 'Supermarket', icon: 'shopping' },
    ],
  },
  {
    group: 'Transport',
    type: 'expense',
    color: 'transport',
    items: [
      { name: 'Petrol', icon: 'fuel' },
      { name: 'Diesel', icon: 'fuel' },
      { name: 'CNG', icon: 'fuel' },
      { name: 'EV Charging', icon: 'bills' },
      { name: 'Auto', icon: 'transport' },
      { name: 'Uber', icon: 'transport' },
      { name: 'Ola', icon: 'transport' },
      { name: 'Rapido', icon: 'bike' },
      { name: 'Bus', icon: 'bus' },
      { name: 'Metro', icon: 'train' },
      { name: 'Train', icon: 'train' },
      { name: 'Parking', icon: 'mapPin' },
      { name: 'Toll', icon: 'mapPin' },
      { name: 'Car Maintenance', icon: 'wrench' },
      { name: 'Bike Maintenance', icon: 'wrench' },
    ],
  },
  {
    group: 'Home',
    type: 'expense',
    color: 'home',
    items: [
      { name: 'Rent', icon: 'home' },
      { name: 'Electricity', icon: 'bills' },
      { name: 'Water', icon: 'droplet' },
      { name: 'Gas', icon: 'flame' },
      { name: 'Internet', icon: 'wifi' },
      { name: 'Mobile Recharge', icon: 'smartphone' },
      { name: 'DTH', icon: 'tv' },
      { name: 'Maintenance', icon: 'wrench' },
      { name: 'Repairs', icon: 'wrench' },
    ],
  },
  {
    group: 'Shopping',
    type: 'expense',
    color: 'shopping',
    items: [
      { name: 'Clothes', icon: 'shirt' },
      { name: 'Shoes', icon: 'shopping' },
      { name: 'Electronics', icon: 'laptop' },
      { name: 'Amazon', icon: 'package' },
      { name: 'Flipkart', icon: 'package' },
      { name: 'Myntra', icon: 'shirt' },
      { name: 'Beauty', icon: 'sparkles' },
      { name: 'Gifts', icon: 'gift' },
    ],
  },
  {
    group: 'Entertainment',
    type: 'expense',
    color: 'entertainment',
    items: [
      { name: 'Movies', icon: 'entertainment' },
      { name: 'Netflix', icon: 'tv' },
      { name: 'Prime Video', icon: 'tv' },
      { name: 'Spotify', icon: 'music' },
      { name: 'YouTube Premium', icon: 'music' },
      { name: 'Gaming', icon: 'gamepad' },
      { name: 'Events', icon: 'ticket' },
      { name: 'Hobbies', icon: 'sparkles' },
    ],
  },
  {
    group: 'Alcohol & Smoking',
    type: 'expense',
    color: 'alcohol',
    items: [
      { name: 'Alcohol', icon: 'glass' },
      { name: 'Beer', icon: 'beer' },
      { name: 'Whisky', icon: 'glass' },
      { name: 'Vodka', icon: 'glass' },
      { name: 'Rum', icon: 'glass' },
      { name: 'Cigarettes', icon: 'cigarette' },
      { name: 'Tobacco', icon: 'cigarette' },
      { name: 'Other', icon: 'circle' },
    ],
  },
  {
    group: 'Health',
    type: 'expense',
    color: 'health',
    items: [
      { name: 'Doctor', icon: 'health' },
      { name: 'Medicine', icon: 'pill' },
      { name: 'Pharmacy', icon: 'pill' },
      { name: 'Dental', icon: 'health' },
      { name: 'Tests', icon: 'flask' },
      { name: 'Hospital', icon: 'health' },
      { name: 'Insurance', icon: 'umbrella' },
      { name: 'Gym', icon: 'dumbbell' },
    ],
  },
  {
    group: 'Financial',
    type: 'expense',
    color: 'financial',
    items: [
      { name: 'EMI', icon: 'bank' },
      { name: 'Loan Payment', icon: 'bank' },
      { name: 'Insurance', icon: 'umbrella' },
      { name: 'Investment', icon: 'investment' },
      { name: 'Mutual Fund', icon: 'investment' },
      { name: 'Stocks', icon: 'trendingUp' },
      { name: 'Savings', icon: 'piggyBank' },
      { name: 'Bank Charges', icon: 'bank' },
      { name: 'ATM Withdrawal', icon: 'cash' },
    ],
  },
  {
    group: 'Travel',
    type: 'expense',
    color: 'travel',
    items: [
      { name: 'Flights', icon: 'plane' },
      { name: 'Hotel', icon: 'bed' },
      { name: 'Travel Food', icon: 'food' },
      { name: 'Activities', icon: 'ticket' },
      { name: 'Visa', icon: 'globe' },
      { name: 'Travel Insurance', icon: 'umbrella' },
    ],
  },
  {
    group: 'Personal',
    type: 'expense',
    color: 'personal',
    items: [
      { name: 'Education', icon: 'education' },
      { name: 'Family', icon: 'users' },
      { name: 'Parents', icon: 'users' },
      { name: 'Children', icon: 'users' },
      { name: 'Gifts', icon: 'gift' },
      { name: 'Donations', icon: 'heart' },
      { name: 'Other', icon: 'circle' },
    ],
  },
  /**
   * Income needs its own set. Without one the "Add income" flow has nothing to
   * pick from, and a salary filed under "Other" is a salary nobody can chart.
   */
  {
    group: 'Income',
    type: 'income',
    color: 'income',
    items: [
      { name: 'Salary', icon: 'briefcase' },
      { name: 'Business', icon: 'briefcase' },
      { name: 'Freelance', icon: 'laptop' },
      { name: 'Bonus', icon: 'gift' },
      { name: 'Interest', icon: 'trendingUp' },
      { name: 'Dividends', icon: 'trendingUp' },
      { name: 'Rental Income', icon: 'home' },
      { name: 'Refund', icon: 'repeat' },
      { name: 'Cashback', icon: 'wallet' },
      { name: 'Gift', icon: 'gift' },
      { name: 'Other', icon: 'circle' },
    ],
  },
];

export type FlatSeedCategory = {
  name: string;
  icon: string;
  group: string;
  type: CategoryType;
  color: string;
  isDefault: true;
  isActive: true;
  sortOrder: number;
};

/** Flat view, with the per-group metadata folded into each row. */
export function flattenDefaults(): FlatSeedCategory[] {
  return DEFAULT_CATEGORIES.flatMap((group, groupIndex) =>
    group.items.map(
      (item, itemIndex): FlatSeedCategory => ({
        name: item.name,
        icon: item.icon,
        group: group.group,
        type: group.type,
        color: group.color,
        isDefault: true,
        isActive: true,
        // Groups stay in the order written above, items in the order within them.
        sortOrder: groupIndex * 100 + itemIndex,
      }),
    ),
  );
}

/**
 * The accounts a new user starts with. Cash plus one bank account is the minimum
 * that makes the very first transfer possible — an app that opens on an empty
 * account list makes the first thing anyone tries to do fail.
 */
export const DEFAULT_ACCOUNTS = [
  { name: 'Cash', type: 'cash' as const, icon: 'cash', color: '#2BD98C' },
  { name: 'Bank Account', type: 'bank' as const, icon: 'bank', color: '#4C8DFF' },
] as const;
