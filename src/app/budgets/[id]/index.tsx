import { useLocalSearchParams } from 'expo-router';

import { BudgetDetailScreen } from '@/features/budgets/BudgetDetailScreen';

export default function BudgetDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetDetailScreen id={id} />;
}
