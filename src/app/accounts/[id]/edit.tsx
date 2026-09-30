import { useLocalSearchParams } from 'expo-router';

import { AccountFormScreen } from '@/features/accounts/AccountFormScreen';

export default function EditAccountRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountFormScreen id={id} />;
}
