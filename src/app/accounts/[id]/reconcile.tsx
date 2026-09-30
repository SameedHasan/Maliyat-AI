import { useLocalSearchParams } from 'expo-router';

import { ReconcileScreen } from '@/features/accounts/ReconcileScreen';

export default function ReconcileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReconcileScreen id={id} />;
}
