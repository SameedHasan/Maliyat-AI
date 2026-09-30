import type { CategoryKind } from './types';

export interface DefaultCategory {
  key: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  children?: { key: string; name: string; icon: string }[];
}

/**
 * Starter categories copied into each user's database at first-run setup, so users can
 * freely rename, hide, or reorder them. `key` is stable and used by the seed generator.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    key: 'food',
    name: 'Food',
    kind: 'expense',
    icon: 'restaurant-outline',
    children: [
      { key: 'groceries', name: 'Groceries', icon: 'cart-outline' },
      { key: 'restaurants', name: 'Restaurants', icon: 'restaurant-outline' },
      { key: 'fast_food', name: 'Fast Food', icon: 'fast-food-outline' },
      { key: 'coffee', name: 'Coffee & Tea', icon: 'cafe-outline' },
    ],
  },
  {
    key: 'transport',
    name: 'Transport',
    kind: 'expense',
    icon: 'car-outline',
    children: [
      { key: 'fuel', name: 'Fuel', icon: 'speedometer-outline' },
      { key: 'ride_hailing', name: 'Taxi & Ride-hailing', icon: 'car-sport-outline' },
      { key: 'public_transport', name: 'Public Transport', icon: 'bus-outline' },
      { key: 'vehicle_maintenance', name: 'Vehicle Maintenance', icon: 'construct-outline' },
    ],
  },
  {
    key: 'housing',
    name: 'Housing',
    kind: 'expense',
    icon: 'home-outline',
    children: [
      { key: 'rent', name: 'Rent', icon: 'key-outline' },
      { key: 'home_maintenance', name: 'Maintenance', icon: 'hammer-outline' },
    ],
  },
  {
    key: 'utilities',
    name: 'Utilities',
    kind: 'expense',
    icon: 'flash-outline',
    children: [
      { key: 'electricity', name: 'Electricity', icon: 'flash-outline' },
      { key: 'gas', name: 'Gas', icon: 'flame-outline' },
      { key: 'water', name: 'Water', icon: 'water-outline' },
      { key: 'internet', name: 'Internet', icon: 'wifi-outline' },
      { key: 'mobile', name: 'Mobile', icon: 'phone-portrait-outline' },
    ],
  },
  {
    key: 'shopping',
    name: 'Shopping',
    kind: 'expense',
    icon: 'bag-outline',
    children: [
      { key: 'clothing', name: 'Clothing', icon: 'shirt-outline' },
      { key: 'electronics', name: 'Electronics', icon: 'hardware-chip-outline' },
      { key: 'household', name: 'Household', icon: 'basket-outline' },
    ],
  },
  {
    key: 'health',
    name: 'Health',
    kind: 'expense',
    icon: 'medkit-outline',
    children: [
      { key: 'doctor', name: 'Doctor', icon: 'medical-outline' },
      { key: 'medicine', name: 'Medicine', icon: 'bandage-outline' },
    ],
  },
  {
    key: 'education',
    name: 'Education',
    kind: 'expense',
    icon: 'school-outline',
    children: [
      { key: 'fees', name: 'Fees', icon: 'school-outline' },
      { key: 'books', name: 'Books & Courses', icon: 'book-outline' },
    ],
  },
  {
    key: 'entertainment',
    name: 'Entertainment',
    kind: 'expense',
    icon: 'film-outline',
    children: [
      { key: 'subscriptions', name: 'Subscriptions', icon: 'repeat-outline' },
      { key: 'outings', name: 'Outings', icon: 'ticket-outline' },
    ],
  },
  {
    key: 'family',
    name: 'Family & Giving',
    kind: 'expense',
    icon: 'people-outline',
    children: [
      { key: 'gifts_given', name: 'Gifts', icon: 'gift-outline' },
      { key: 'charity', name: 'Charity & Zakat', icon: 'heart-outline' },
    ],
  },
  { key: 'personal_care', name: 'Personal Care', icon: 'sparkles-outline', kind: 'expense' },
  {
    key: 'bank_charges',
    name: 'Bank Charges',
    kind: 'expense',
    icon: 'card-outline',
    children: [
      { key: 'transfer_fees', name: 'Transfer Fees', icon: 'swap-horizontal-outline' },
      { key: 'card_fees', name: 'Card Fees', icon: 'card-outline' },
    ],
  },
  { key: 'other_expense', name: 'Other', icon: 'ellipsis-horizontal-outline', kind: 'expense' },

  { key: 'salary', name: 'Salary', icon: 'briefcase-outline', kind: 'income' },
  { key: 'freelance', name: 'Freelance', icon: 'laptop-outline', kind: 'income' },
  { key: 'business', name: 'Business', icon: 'storefront-outline', kind: 'income' },
  { key: 'returns', name: 'Profit & Returns', icon: 'trending-up-outline', kind: 'income' },
  { key: 'gifts_received', name: 'Gifts Received', icon: 'gift-outline', kind: 'income' },
  { key: 'other_income', name: 'Other Income', icon: 'add-circle-outline', kind: 'income' },

  { key: 'investments', name: 'Investments', icon: 'stats-chart-outline', kind: 'system' },
];
