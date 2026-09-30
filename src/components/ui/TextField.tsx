import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Text } from './Text';

export interface TextFieldProps extends Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'keyboardType'
  | 'inputMode'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'autoFocus'
  | 'maxLength'
  | 'multiline'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'accessibilityHint'
  | 'selectTextOnFocus'
> {
  label: string;
  /** Already-translated error message. */
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, multiline, ...inputProps },
  ref,
) {
  const styles = useStyles();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...inputProps}
        multiline={multiline}
        accessibilityLabel={label}
        aria-invalid={!!error}
        placeholderTextColor={theme.colors.textMuted}
        cursorColor={theme.colors.primary}
        selectionColor={theme.colors.primary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.invalid,
        ]}
      />
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((t) => ({
  field: { gap: t.spacing[1] },
  input: {
    ...t.typography.body,
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing[3],
    paddingVertical: t.spacing[2],
    borderRadius: t.radius.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    color: t.colors.text,
  },
  multiline: { minHeight: t.touchTarget * 2, textAlignVertical: 'top' },
  focused: { borderColor: t.colors.primary },
  invalid: { borderColor: t.colors.danger },
}));
