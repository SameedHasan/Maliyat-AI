import { useLocalSearchParams } from 'expo-router';

import { FORM_KINDS, type FormKind } from '@/domain/transactionForm';
import { TransactionFormScreen } from '@/features/transactions/TransactionFormScreen';

export default function NewTransactionRoute() {
  const params = useLocalSearchParams<{
    kind?: string;
    duplicateOf?: string;
    refundOf?: string;
    accountId?: string;
  }>();
  const kind = FORM_KINDS.includes(params.kind as FormKind) ? (params.kind as FormKind) : undefined;
  return (
    <TransactionFormScreen
      kind={kind}
      duplicateOf={params.duplicateOf}
      refundOf={params.refundOf}
      accountId={params.accountId}
    />
  );
}
