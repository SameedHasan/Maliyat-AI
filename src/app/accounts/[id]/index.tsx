import { useLocalSearchParams } from 'expo-router';

import { AccountDetailScreen } from '@/features/accounts/AccountDetailScreen';

export default function AccountDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountDetailScreen id={id} />;
}
