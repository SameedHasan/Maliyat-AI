import { useLocalSearchParams } from 'expo-router';

import { CategoryFormScreen } from '@/features/categories/CategoryFormScreen';

export default function NewCategoryRoute() {
  const { kind, parentId } = useLocalSearchParams<{ kind?: string; parentId?: string }>();
  return <CategoryFormScreen kind={kind === 'income' ? 'income' : 'expense'} parentId={parentId} />;
}
