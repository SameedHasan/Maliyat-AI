import { addDays, type LocalDate } from '../../domain/dates';
import type { TransactionInput } from '../../domain/schemas';
import type { Random } from './random';

export interface SeedAccountIds {
  cash: string;
  hbl: string;
  meezan: string;
  jazzcash: string;
  easypaisa: string;
  card: string;
}

export interface SeedOptions {
  today: LocalDate;
  months: number;
  random: Random;
  accounts: SeedAccountIds;
  category: (key: string) => string;
}

const PAYEES = {
  groceries: ['Imtiaz', 'Carrefour', 'Al-Fatah', 'Chase Up', 'Metro', 'Local Kiryana'],
  restaurants: ['Kababjees', 'Savour Foods', 'Monal', 'Butt Karahi', 'Salt n Pepper'],
  fast_food: ['KFC', "McDonald's", 'Hardee’s', 'Broadway Pizza', 'Shawarma Stall'],
  coffee: ['Chai Dhaba', 'Gloria Jean’s', 'Tim Hortons', 'Espresso', 'Chai Wala'],
  ride_hailing: ['Careem', 'inDrive', 'Yango', 'Bykea'],
  fuel: ['PSO', 'Shell', 'TotalEnergies', 'Attock Petroleum'],
  public_transport: ['Metro Bus', 'Orange Line', 'Rickshaw'],
  clothing: ['Khaadi', 'Sapphire', 'Outfitters', 'J.', 'Gul Ahmed'],
  electronics: ['Daraz', 'Hafeez Centre', 'Telemart'],
  household: ['Daraz', 'Hyperstar', 'Local Store'],
  medicine: ['D.Watson', 'Servaid', 'Fazal Din'],
  doctor: ['Shaukat Khanum', 'Aga Khan Clinic', 'Family Clinic'],
  personal_care: ['Toni&Guy', 'Local Barber', 'Sephora Counter'],
  outings: ['Cinepax', 'Nueplex', 'Bowling Alley', 'Food Street'],
  gifts_given: ['Gift Shop', 'Mithai Shop'],
  charity: ['Edhi Foundation', 'Saylani', 'Masjid'],
} as const;

type PayeeKey = keyof typeof PAYEES;

interface DailyRule {
  category: PayeeKey;
  rate: number;
  min: number;
  max: number;
  accounts: (keyof SeedAccountIds)[];
}

const DAILY: DailyRule[] = [
  { category: 'coffee', rate: 1.2, min: 80, max: 900, accounts: ['cash', 'jazzcash', 'cash'] },
  { category: 'fast_food', rate: 0.9, min: 350, max: 3200, accounts: ['card', 'jazzcash', 'cash'] },
  { category: 'restaurants', rate: 0.35, min: 1500, max: 9000, accounts: ['card', 'hbl'] },
  {
    category: 'ride_hailing',
    rate: 1.3,
    min: 180,
    max: 1600,
    accounts: ['jazzcash', 'cash', 'easypaisa'],
  },
  { category: 'public_transport', rate: 0.5, min: 30, max: 200, accounts: ['cash'] },
  { category: 'groceries', rate: 0.6, min: 600, max: 9500, accounts: ['hbl', 'card', 'cash'] },
  { category: 'fuel', rate: 0.3, min: 2500, max: 8500, accounts: ['card', 'cash'] },
  { category: 'household', rate: 0.25, min: 300, max: 4500, accounts: ['cash', 'hbl'] },
  { category: 'medicine', rate: 0.12, min: 250, max: 4000, accounts: ['cash', 'hbl'] },
  { category: 'personal_care', rate: 0.1, min: 500, max: 3500, accounts: ['cash', 'card'] },
  { category: 'outings', rate: 0.15, min: 800, max: 6000, accounts: ['card', 'jazzcash'] },
  { category: 'clothing', rate: 0.08, min: 2000, max: 18000, accounts: ['card', 'hbl'] },
  { category: 'electronics', rate: 0.02, min: 3000, max: 60000, accounts: ['card', 'hbl'] },
  { category: 'doctor', rate: 0.03, min: 1500, max: 8000, accounts: ['hbl', 'cash'] },
  { category: 'gifts_given', rate: 0.04, min: 1000, max: 10000, accounts: ['cash', 'hbl'] },
  { category: 'charity', rate: 0.06, min: 200, max: 5000, accounts: ['cash', 'jazzcash'] },
];

const dayOfMonth = (date: LocalDate) => Number(date.slice(8, 10));
const monthOf = (date: LocalDate) => Number(date.slice(5, 7));

/**
 * Generates realistic PKR personal-finance activity from `months` ago up to `today`.
 * Output is deterministic for a given random seed and always satisfies ledger rules.
 */
export function generateSeedTransactions(options: SeedOptions): TransactionInput[] {
  const { today, months, random: rnd, accounts: acc, category } = options;
  const out: TransactionInput[] = [];

  const expense = (
    on: LocalDate,
    key: string,
    accountId: string,
    amountMinor: number,
    payee?: string,
  ) =>
    out.push({
      kind: 'expense',
      occurredOn: on,
      payee: payee ?? null,
      source: 'seed',
      entries: [{ accountId, categoryId: category(key), amountMinor: -amountMinor }],
    });

  const income = (
    on: LocalDate,
    key: string,
    accountId: string,
    amountMinor: number,
    payee: string,
  ) =>
    out.push({
      kind: 'income',
      occurredOn: on,
      payee,
      source: 'seed',
      entries: [{ accountId, categoryId: category(key), amountMinor }],
    });

  const transfer = (on: LocalDate, from: string, to: string, amountMinor: number, feeMinor = 0) =>
    out.push({
      kind: 'transfer',
      occurredOn: on,
      source: 'seed',
      entries: [
        { accountId: from, categoryId: null, amountMinor: -amountMinor },
        { accountId: to, categoryId: null, amountMinor },
        ...(feeMinor > 0
          ? [{ accountId: from, categoryId: category('transfer_fees'), amountMinor: -feeMinor }]
          : []),
      ],
    });

  const totalDays = Math.round(months * 30.44);
  const start = addDays(today, -totalDays);

  for (let i = 0; i <= totalDays; i++) {
    const on = addDays(start, i);
    const dom = dayOfMonth(on);
    const month = monthOf(on);
    const summer = month >= 5 && month <= 9;

    // Monthly fixed events.
    if (dom === 1) income(on, 'salary', acc.hbl, rnd.rupees(320000, 320000), 'Employer Payroll');
    if (dom === 3) expense(on, 'rent', acc.hbl, 6500000, 'Landlord');
    if (dom === 8) {
      expense(
        on,
        'electricity',
        acc.hbl,
        rnd.rupees(summer ? 14000 : 5000, summer ? 32000 : 11000),
        'K-Electric',
      );
      expense(
        on,
        'gas',
        acc.jazzcash,
        rnd.rupees(summer ? 800 : 3000, summer ? 2000 : 9000),
        'SSGC',
      );
      expense(on, 'internet', acc.hbl, 450000, 'StormFiber');
    }
    if (dom === 10) expense(on, 'mobile', acc.jazzcash, rnd.rupees(1000, 2500), 'Jazz');
    if (dom === 12) transfer(on, acc.hbl, acc.meezan, 4000000);
    if (dom === 15) expense(on, 'subscriptions', acc.card, 110000, 'Netflix');
    if (dom === 18) expense(on, 'subscriptions', acc.card, 34900, 'Spotify');
    if (dom === 20) transfer(on, acc.hbl, acc.card, rnd.rupees(25000, 70000, 1000));
    if (dom === 25 && rnd.chance(0.35)) {
      income(on, 'freelance', acc.meezan, rnd.rupees(40000, 150000, 1000), 'Upwork Client');
    }
    if (dom === 28 && rnd.chance(0.3)) {
      income(on, 'returns', acc.meezan, rnd.rupees(2000, 9000), 'Meezan Profit');
    }

    // Wallet top-ups and cash withdrawals.
    if (rnd.chance(0.16)) {
      transfer(on, acc.hbl, acc.jazzcash, rnd.rupees(3000, 15000, 500), rnd.chance(0.3) ? 2500 : 0);
    }
    if (rnd.chance(0.06)) transfer(on, acc.hbl, acc.easypaisa, rnd.rupees(2000, 8000, 500));
    if (rnd.chance(0.1)) transfer(on, acc.hbl, acc.cash, rnd.rupees(10000, 25000, 1000));

    // Day-to-day spending.
    for (const rule of DAILY) {
      const n = rnd.count(rule.rate);
      for (let k = 0; k < n; k++) {
        const accountId = acc[rnd.pick(rule.accounts)];
        const amount = rnd.rupees(rule.min, rule.max);
        const payee = rnd.pick(PAYEES[rule.category]);

        if (rule.category === 'groceries' && rnd.chance(0.2)) {
          const household = Math.round((amount * 0.3) / 100) * 100;
          out.push({
            kind: 'expense',
            occurredOn: on,
            payee,
            source: 'seed',
            entries: [
              { accountId, categoryId: category('groceries'), amountMinor: -(amount - household) },
              { accountId, categoryId: category('household'), amountMinor: -household },
            ],
          });
          continue;
        }

        expense(on, rule.category, accountId, amount, payee);

        if ((rule.category === 'clothing' || rule.category === 'electronics') && rnd.chance(0.08)) {
          const refundOn = addDays(on, rnd.int(2, 10));
          if (refundOn <= today) {
            out.push({
              kind: 'refund',
              occurredOn: refundOn,
              payee,
              source: 'seed',
              entries: [{ accountId, categoryId: category(rule.category), amountMinor: amount }],
            });
          }
        }
      }
    }
  }

  return out.sort((a, b) =>
    a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0,
  );
}
