import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { CURRENCIES, type CurrencyCode } from '@/domain/money';
import { makeStyles, useTheme } from '@/theme';

import { Text } from './Text';

export interface AmountInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  currency: CurrencyCode;
  error?: string | null;
  size?: 'large' | 'normal';
  autoFocus?: boolean;
  placeholder?: string;
}

/** Positive amounts only; the sign comes from the transaction kind. */
export function AmountInput({
  label,
  value,
  onChangeText,
  currency,
  error,
  size = 'normal',
  autoFocus,
  placeholder = '0',
}: AmountInputProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const large = size === 'large';
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <View
        style={[
          styles.box,
          large && styles.boxLarge,
          focused && styles.focused,
          !!error && styles.invalid,
        ]}>
        <Text variant={large ? 'title' : 'body'} color="textSecondary">
          {CURRENCIES[currency].symbol}
        </Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/[^\d.,]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus={autoFocus}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          cursorColor={theme.colors.primary}
          selectionColor={theme.colors.primary}
          accessibilityLabel={label}
          aria-invalid={!!error}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, large ? styles.inputLarge : null]}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  field: { gap: t.spacing[1] },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[2],
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing[3],
    borderRadius: t.radius.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  boxLarge: { minHeight: t.touchTarget + t.spacing[6] },
  focused: { borderColor: t.colors.primary },
  invalid: { borderColor: t.colors.danger },
  input: {
    ...t.typography.mono,
    flex: 1,
    color: t.colors.text,
    paddingVertical: t.spacing[2],
  },
  inputLarge: { ...t.typography.display, fontVariant: ['tabular-nums'] },
}));
