/**
 * Merchant name → domain, for logo lookup.
 *
 * Only real, identifiable businesses belong here. Anything personal or generic —
 * "Auto rickshaw", "Household help", "Salary credit" — has no domain and falls back
 * to a monogram, which is the right answer for those anyway.
 */
const DOMAINS: Record<string, string> = {
  // Food
  Blinkit: 'blinkit.com',
  Swiggy: 'swiggy.com',
  'Swiggy Instamart': 'swiggy.com',
  Zepto: 'zeptonow.com',
  Zomato: 'zomato.com',
  BigBasket: 'bigbasket.com',
  DMart: 'dmart.in',
  Licious: 'licious.in',
  "Domino's Pizza": 'dominos.co.in',
  'Third Wave Coffee': 'thirdwavecoffee.in',

  // Transport
  'Indian Oil': 'iocl.com',
  Uber: 'uber.com',
  Ola: 'olacabs.com',
  Rapido: 'rapido.bike',
  'HP Petrol Pump': 'hindustanpetroleum.com',
  'Shell Petrol': 'shell.in',

  // Shopping
  Myntra: 'myntra.com',
  Amazon: 'amazon.in',
  Decathlon: 'decathlon.in',

  // Bills
  'Airtel Postpaid': 'airtel.in',
  JioFiber: 'jio.com',
  'BESCOM Electricity': 'bescom.co.in',

  // Everything else
  'Apollo Pharmacy': 'apollopharmacy.in',
  'Cult.fit membership': 'cult.fit',
  'PVR Cinemas': 'pvrcinemas.com',
  Netflix: 'netflix.com',
  'Udemy course': 'udemy.com',
};

/** The domain to fetch a logo for, or undefined when there is no real brand. */
export function merchantDomain(name: string): string | undefined {
  return DOMAINS[name];
}
