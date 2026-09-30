import { useLocalSearchParams } from 'expo-router';

import { CategoryFormScreen } from '@/features/categories/CategoryFormScreen';

export default function EditCategoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CategoryFormScreen id={id} />;
}
