/**
 * Maintainable Indian Merchant & Category Knowledge Base.
 *
 * Maps recognizable Indian brand names, fuel stations, telecom operators, delivery
 * apps, and common category terms to their canonical merchant name and category.
 *
 * Consulted before any LLM inference:
 * - Instant (<1ms)
 * - 100% deterministic
 * - Zero token costs
 * - Never hallucinates
 */

export type IndianMerchantRule = {
  /** Canonical display name of the merchant */
  canonicalName: string;
  /** Regex pattern to match merchant name variations */
  pattern: RegExp;
  /** Target category name */
  categoryName: string;
  /** Fallback category group if exact category is not present */
  categoryGroup: string;
};

export const INDIAN_MERCHANTS: readonly IndianMerchantRule[] = [
  // ---------------------------------------------------------------------- Fuel
  {
    canonicalName: 'IndianOil',
    pattern: /\b(indianoil|indian\s*oil|iocl)\b/i,
    categoryName: 'Petrol',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Bharat Petroleum',
    pattern: /\b(bharat\s*petroleum|bharat\s*petro|bpcl)\b/i,
    categoryName: 'Petrol',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'HPCL',
    pattern: /\b(hindustan\s*petroleum|hindustan\s*petro|hpcl|hp\s*petrol)\b/i,
    categoryName: 'Petrol',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Shell',
    pattern: /\b(shell\s*petrol|shell\s*fuel|shell)\b/i,
    categoryName: 'Petrol',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Nayara Energy',
    pattern: /\b(nayara|nayara\s*energy)\b/i,
    categoryName: 'Petrol',
    categoryGroup: 'Transport',
  },

  // ------------------------------------------------------------ Food & Delivery
  {
    canonicalName: 'Zomato',
    pattern: /\bzomato\b/i,
    categoryName: 'Zomato',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Swiggy Instamart',
    pattern: /\b(instamart|swiggy\s*instamart)\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
  },
  {
    canonicalName: 'Swiggy',
    pattern: /\bswiggy\b/i,
    categoryName: 'Swiggy',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'McDonald\'s',
    pattern: /\b(mcdonald'?s?|mcd)\b/i,
    categoryName: 'Fast Food',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Domino\'s',
    pattern: /\b(domino'?s?|dominos\s*pizza)\b/i,
    categoryName: 'Fast Food',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'KFC',
    pattern: /\bkfc\b/i,
    categoryName: 'Fast Food',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Burger King',
    pattern: /\bburger\s*king\b/i,
    categoryName: 'Fast Food',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Starbucks',
    pattern: /\bstarbucks\b/i,
    categoryName: 'Cafe',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Third Wave Coffee',
    pattern: /\b(third\s*wave|third\s*wave\s*coffee)\b/i,
    categoryName: 'Cafe',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Blue Tokai',
    pattern: /\bblue\s*tokai\b/i,
    categoryName: 'Cafe',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Cafe Coffee Day',
    pattern: /\b(ccd|cafe\s*coffee\s*day)\b/i,
    categoryName: 'Cafe',
    categoryGroup: 'Food',
  },
  {
    canonicalName: 'Haldiram\'s',
    pattern: /\bhaldiram'?s?\b/i,
    categoryName: 'Sweets & Bakery',
    categoryGroup: 'Food',
  },

  // --------------------------------------------------- Groceries & Quick Comm
  {
    canonicalName: 'DMart',
    pattern: /\b(dmart|d\s*mart|d-mart|avenue\s*supermarts)\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
  },
  {
    canonicalName: 'Blinkit',
    pattern: /\b(blinkit|grofers)\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
  },
  {
    canonicalName: 'Zepto',
    pattern: /\bzepto\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
  },
  {
    canonicalName: 'BigBasket',
    pattern: /\b(bigbasket|bb\s*now|bbnow)\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
  },
  {
    canonicalName: 'JioMart',
    pattern: /\bjiomart\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
  },

  // --------------------------------------------------- Transport & Commute
  {
    canonicalName: 'Uber',
    pattern: /\buber\b/i,
    categoryName: 'Uber',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Ola',
    pattern: /\b(ola|ola\s*cabs)\b/i,
    categoryName: 'Ola',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Rapido',
    pattern: /\brapido\b/i,
    categoryName: 'Rapido',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Namma Metro',
    pattern: /\b(namma\s*metro|bangalore\s*metro)\b/i,
    categoryName: 'Metro',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'Delhi Metro',
    pattern: /\b(dmrc|delhi\s*metro)\b/i,
    categoryName: 'Metro',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'IRCTC',
    pattern: /\b(irctc|indian\s*railways)\b/i,
    categoryName: 'Train',
    categoryGroup: 'Transport',
  },
  {
    canonicalName: 'IndiGo',
    pattern: /\b(indigo|indigo\s*airlines)\b/i,
    categoryName: 'Flights',
    categoryGroup: 'Travel',
  },
  {
    canonicalName: 'Air India',
    pattern: /\bair\s*india\b/i,
    categoryName: 'Flights',
    categoryGroup: 'Travel',
  },
  {
    canonicalName: 'Vistara',
    pattern: /\bvistara\b/i,
    categoryName: 'Flights',
    categoryGroup: 'Travel',
  },

  // ------------------------------------------------ Entertainment & Subscriptions
  {
    canonicalName: 'Netflix',
    pattern: /\bnetflix\b/i,
    categoryName: 'Netflix',
    categoryGroup: 'Entertainment',
  },
  {
    canonicalName: 'Prime Video',
    pattern: /\b(prime\s*video|amazon\s*prime)\b/i,
    categoryName: 'Prime Video',
    categoryGroup: 'Entertainment',
  },
  {
    canonicalName: 'Spotify',
    pattern: /\bspotify\b/i,
    categoryName: 'Spotify',
    categoryGroup: 'Entertainment',
  },
  {
    canonicalName: 'YouTube Premium',
    pattern: /\b(youtube\s*premium|yt\s*premium)\b/i,
    categoryName: 'YouTube Premium',
    categoryGroup: 'Entertainment',
  },
  {
    canonicalName: 'Hotstar',
    pattern: /\b(hotstar|disney\+?\s*hotstar)\b/i,
    categoryName: 'Movies',
    categoryGroup: 'Entertainment',
  },
  {
    canonicalName: 'BookMyShow',
    pattern: /\b(bookmyshow|bms)\b/i,
    categoryName: 'Movies',
    categoryGroup: 'Entertainment',
  },
  {
    canonicalName: 'PVR',
    pattern: /\b(pvr|pvr\s*cinemas|inox)\b/i,
    categoryName: 'Movies',
    categoryGroup: 'Entertainment',
  },

  // ------------------------------------------------------------- Telecom & Home
  {
    canonicalName: 'Airtel',
    pattern: /\bairtel\b/i,
    categoryName: 'Mobile Recharge',
    categoryGroup: 'Home',
  },
  {
    canonicalName: 'Jio',
    pattern: /\b(jio|reliance\s*jio)\b/i,
    categoryName: 'Mobile Recharge',
    categoryGroup: 'Home',
  },
  {
    canonicalName: 'Vi',
    pattern: /\b(vodafone|idea|vi\b)/i,
    categoryName: 'Mobile Recharge',
    categoryGroup: 'Home',
  },
  {
    canonicalName: 'Tata Play',
    pattern: /\b(tata\s*play|tata\s*sky)\b/i,
    categoryName: 'DTH',
    categoryGroup: 'Home',
  },
  {
    canonicalName: 'ACT Fibernet',
    pattern: /\b(act\s*fibernet|act\s*broadband)\b/i,
    categoryName: 'Internet',
    categoryGroup: 'Home',
  },
  {
    canonicalName: 'JioFiber',
    pattern: /\bjio\s*fiber\b/i,
    categoryName: 'Internet',
    categoryGroup: 'Home',
  },
  {
    canonicalName: 'BESCOM',
    pattern: /\bbescom\b/i,
    categoryName: 'Electricity',
    categoryGroup: 'Home',
  },

  // ---------------------------------------------------------- Health & Pharmacy
  {
    canonicalName: 'Apollo Pharmacy',
    pattern: /\bapollo(\s*pharmacy)?\b/i,
    categoryName: 'Pharmacy',
    categoryGroup: 'Health',
  },
  {
    canonicalName: 'PharmEasy',
    pattern: /\bpharmeasy\b/i,
    categoryName: 'Pharmacy',
    categoryGroup: 'Health',
  },
  {
    canonicalName: 'Tata 1mg',
    pattern: /\b(1mg|tata\s*1mg)\b/i,
    categoryName: 'Pharmacy',
    categoryGroup: 'Health',
  },
  {
    canonicalName: 'Cult.fit',
    pattern: /\b(cult\.?fit|cultfit)\b/i,
    categoryName: 'Gym',
    categoryGroup: 'Health',
  },

  // ------------------------------------------------------------------- Shopping
  {
    canonicalName: 'Amazon',
    pattern: /\bamazon\b/i,
    categoryName: 'Amazon',
    categoryGroup: 'Shopping',
  },
  {
    canonicalName: 'Flipkart',
    pattern: /\bflipkart\b/i,
    categoryName: 'Flipkart',
    categoryGroup: 'Shopping',
  },
  {
    canonicalName: 'Myntra',
    pattern: /\bmyntra\b/i,
    categoryName: 'Myntra',
    categoryGroup: 'Shopping',
  },
  {
    canonicalName: 'Ajio',
    pattern: /\bajio\b/i,
    categoryName: 'Clothes',
    categoryGroup: 'Shopping',
  },
  {
    canonicalName: 'Nykaa',
    pattern: /\bnykaa\b/i,
    categoryName: 'Beauty',
    categoryGroup: 'Shopping',
  },
  {
    canonicalName: 'Croma',
    pattern: /\bcroma\b/i,
    categoryName: 'Electronics',
    categoryGroup: 'Shopping',
  },
];

export type DirectCategoryRule = {
  pattern: RegExp;
  categoryName: string;
  categoryGroup: string;
  aliases?: string[];
};

/**
 * Direct category keywords that people type as shorthand without a merchant.
 * e.g. "Petrol 1200", "Coffee 180", "Cigarettes 220", "Rent 25000", "EMI 18000"
 */
export const DIRECT_CATEGORY_KEYWORDS: readonly DirectCategoryRule[] = [
  // Fuel / Transport
  { pattern: /\b(petrol|fuel|diesel|cng)\b/i, categoryName: 'Petrol', categoryGroup: 'Transport', aliases: ['Petrol', 'Fuel'] },
  { pattern: /\b(auto|rickshaw|tuk\s*tuk)\b/i, categoryName: 'Auto', categoryGroup: 'Transport', aliases: ['Auto', 'Transport'] },
  { pattern: /\b(metro|subway)\b/i, categoryName: 'Metro', categoryGroup: 'Transport', aliases: ['Metro', 'Train'] },
  { pattern: /\b(bus|bus\s*ticket)\b/i, categoryName: 'Bus', categoryGroup: 'Transport', aliases: ['Bus', 'Transport'] },
  { pattern: /\b(train|railway)\b/i, categoryName: 'Train', categoryGroup: 'Transport', aliases: ['Train', 'Transport'] },
  { pattern: /\b(toll|fastag)\b/i, categoryName: 'Toll', categoryGroup: 'Transport', aliases: ['Toll', 'Parking'] },
  { pattern: /\bparking\b/i, categoryName: 'Parking', categoryGroup: 'Transport', aliases: ['Parking', 'Toll'] },

  // Food & Drinks
  {
    pattern: /\b(tea|chai|cutting\s*chai|masala\s*chai|masala\s*tea|green\s*tea)\b/i,
    categoryName: 'Tea & Chai',
    categoryGroup: 'Food',
    aliases: ['Tea & Chai', 'Tea', 'Chai', 'Cafe', 'Street Food'],
  },
  {
    pattern: /\b(coffee|cafe|cappuccino|latte|kaapi|espresso)\b/i,
    categoryName: 'Cafe',
    categoryGroup: 'Food',
    aliases: ['Cafe', 'Tea & Chai', 'Restaurants'],
  },
  {
    pattern: /\b(lunch|thali|noon\s*meal|meals)\b/i,
    categoryName: 'Lunch',
    categoryGroup: 'Food',
    aliases: ['Lunch', 'Restaurants', 'Food Delivery', 'Fast Food'],
  },
  {
    pattern: /\b(dinner|supper|night\s*meal)\b/i,
    categoryName: 'Dinner',
    categoryGroup: 'Food',
    aliases: ['Dinner', 'Restaurants', 'Food Delivery', 'Fast Food'],
  },
  {
    pattern: /\b(snacks?|namkeen|chaat|samosa|kachori|bhajji|pakoda|pakora)\b/i,
    categoryName: 'Snacks',
    categoryGroup: 'Food',
    aliases: ['Snacks', 'Snacks & Namkeen', 'Street Food', 'Fast Food'],
  },
  {
    pattern: /\b(breakfast|nashta|tiffin)\b/i,
    categoryName: 'Fast Food',
    categoryGroup: 'Food',
    aliases: ['Fast Food', 'Street Food', 'Restaurants'],
  },
  {
    pattern: /\b(street\s*food|pani\s*puri|golgappa|bhel|sev\s*puri)\b/i,
    categoryName: 'Street Food',
    categoryGroup: 'Food',
    aliases: ['Street Food', 'Snacks', 'Fast Food'],
  },
  {
    pattern: /\b(bakery|cake|pastry|sweets|mithai)\b/i,
    categoryName: 'Sweets & Bakery',
    categoryGroup: 'Food',
    aliases: ['Sweets & Bakery', 'Cafe'],
  },
  {
    pattern: /\b(restaurant|dine\s*in|food)\b/i,
    categoryName: 'Restaurants',
    categoryGroup: 'Food',
    aliases: ['Restaurants', 'Food Delivery'],
  },

  // Groceries
  {
    pattern: /\b(groceries|grocery|kirana|supermarket|ration)\b/i,
    categoryName: 'Grocery',
    categoryGroup: 'Grocery',
    aliases: ['Grocery', 'Supermarket'],
  },
  {
    pattern: /\b(vegetables?|sabzi|subzi|veggies?|tarkari)\b/i,
    categoryName: 'Vegetables',
    categoryGroup: 'Grocery',
    aliases: ['Vegetables', 'Grocery', 'Supermarket'],
  },
  {
    pattern: /\b(fruits?|phal)\b/i,
    categoryName: 'Fruits',
    categoryGroup: 'Grocery',
    aliases: ['Fruits', 'Vegetables', 'Grocery'],
  },
  {
    pattern: /\b(milk|doodh|dairy|paneer|curd|dahi)\b/i,
    categoryName: 'Milk & Dairy',
    categoryGroup: 'Grocery',
    aliases: ['Milk & Dairy', 'Grocery'],
  },
  {
    pattern: /\b(chicken|meat|mutton|fish|eggs?)\b/i,
    categoryName: 'Meat & Chicken',
    categoryGroup: 'Grocery',
    aliases: ['Meat & Chicken', 'Fish', 'Grocery'],
  },

  // Smoking & Alcohol
  {
    pattern: /\b(cigarettes?|ciggarate|cigarrette|cig|cigs|sutta|smoke|tobacco|beedi|bidi)\b/i,
    categoryName: 'Cigarettes',
    categoryGroup: 'Alcohol & Smoking',
    aliases: ['Cigarettes', 'Tobacco', 'Other'],
  },
  {
    pattern: /\b(beer)\b/i,
    categoryName: 'Beer',
    categoryGroup: 'Alcohol & Smoking',
    aliases: ['Beer', 'Alcohol'],
  },
  {
    pattern: /\b(alcohol|booze|liquor|theka|daru|daroo|wine|whisky|vodka|rum)\b/i,
    categoryName: 'Alcohol',
    categoryGroup: 'Alcohol & Smoking',
    aliases: ['Alcohol', 'Beer', 'Whisky', 'Vodka', 'Rum'],
  },

  // Home & Utilities
  { pattern: /\brent\b/i, categoryName: 'Rent', categoryGroup: 'Home', aliases: ['Rent'] },
  { pattern: /\b(electricity|bijli|power\s*bill)\b/i, categoryName: 'Electricity', categoryGroup: 'Home', aliases: ['Electricity'] },
  { pattern: /\b(water\s*bill|water)\b/i, categoryName: 'Water', categoryGroup: 'Home', aliases: ['Water'] },
  { pattern: /\b(gas|lpg|gas\s*cylinder)\b/i, categoryName: 'Gas', categoryGroup: 'Home', aliases: ['Gas'] },
  { pattern: /\b(wifi|broadband|internet)\b/i, categoryName: 'Internet', categoryGroup: 'Home', aliases: ['Internet'] },
  { pattern: /\b(mobile\s*recharge|recharge|phone\s*bill)\b/i, categoryName: 'Mobile Recharge', categoryGroup: 'Home', aliases: ['Mobile Recharge'] },
  { pattern: /\b(dth|cable|dish\s*tv)\b/i, categoryName: 'DTH', categoryGroup: 'Home', aliases: ['DTH'] },

  // Health
  { pattern: /\b(medicines?|pharmacy|drugs?|tablets?|dawa)\b/i, categoryName: 'Medicine', categoryGroup: 'Health', aliases: ['Medicine', 'Pharmacy'] },
  { pattern: /\b(doctor|clinic|consultation|dr\b)/i, categoryName: 'Doctor', categoryGroup: 'Health', aliases: ['Doctor', 'Hospital'] },
  { pattern: /\b(hospital|emergency)\b/i, categoryName: 'Hospital', categoryGroup: 'Health', aliases: ['Hospital', 'Doctor'] },
  { pattern: /\b(dental|dentist)\b/i, categoryName: 'Dental', categoryGroup: 'Health', aliases: ['Dental', 'Doctor'] },
  { pattern: /\bgym\b/i, categoryName: 'Gym', categoryGroup: 'Health', aliases: ['Gym'] },

  // Financial
  { pattern: /\b(emi|loan|instalment|installment)\b/i, categoryName: 'EMI', categoryGroup: 'Financial', aliases: ['EMI', 'Loan Payment'] },
  { pattern: /\b(sip|mutual\s*fund|stocks|investment)\b/i, categoryName: 'Investment', categoryGroup: 'Financial', aliases: ['Investment', 'Mutual Fund', 'Stocks'] },
  { pattern: /\b(insurance|premium|policy)\b/i, categoryName: 'Insurance', categoryGroup: 'Financial', aliases: ['Insurance'] },

  // Shopping & Entertainment
  { pattern: /\b(clothes?|shoes?|shopping|dress|shirt|jeans)\b/i, categoryName: 'Clothes', categoryGroup: 'Shopping', aliases: ['Clothes', 'Shoes'] },
  { pattern: /\b(movies?|cinema|film|theatre)\b/i, categoryName: 'Movies', categoryGroup: 'Entertainment', aliases: ['Movies'] },
];

/**
 * Searches the Indian Knowledge Base for a merchant match.
 */
export function matchIndianMerchant(text: string): IndianMerchantRule | null {
  for (const rule of INDIAN_MERCHANTS) {
    if (rule.pattern.test(text)) {
      return rule;
    }
  }
  return null;
}

/**
 * Searches the direct category keywords.
 */
export function matchDirectCategory(text: string): DirectCategoryRule | null {
  for (const rule of DIRECT_CATEGORY_KEYWORDS) {
    if (rule.pattern.test(text)) {
      return rule;
    }
  }
  return null;
}
