import { useLocalSearchParams } from 'expo-router';

import { TransactionFormScreen } from '@/features/transactions/TransactionFormScreen';

export default function EditTransactionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionFormScreen id={id} />;
}
