import { useLocalSearchParams } from 'expo-router';

import { BudgetFormScreen } from '@/features/budgets/BudgetFormScreen';

export default function EditBudgetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetFormScreen id={id} />;
}
