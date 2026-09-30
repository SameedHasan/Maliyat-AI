import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { makeStyles, useTheme } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  action,
}: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Icon name={icon} size="xxl" color="textMuted" />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="bodySmall" color="textSecondary" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useTranslation();
  const text = label ?? t('common.loading');
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={text}
      accessibilityRole="progressbar">
      <ActivityIndicator color={theme.colors.textSecondary} />
      {label ? (
        <Text variant="bodySmall" color="textSecondary">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Technical detail; only pass in development builds. */
  details?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, details, onRetry }: ErrorStateProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Icon name="alert-circle-outline" size="xxl" color="danger" />
      <Text variant="heading" align="center">
        {title ?? t('states.errorTitle')}
      </Text>
      <Text variant="bodySmall" color="textSecondary" align="center" style={styles.message}>
        {message ?? t('states.errorBody')}
      </Text>
      {details ? (
        <Text variant="caption" color="textMuted" align="center" selectable>
          {details}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={styles.action}>
          <Button label={t('common.retry')} variant="secondary" icon="refresh" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing[3],
    paddingHorizontal: t.spacing[8],
    paddingVertical: t.spacing[12],
  },
  message: { maxWidth: 320 },
  action: { marginTop: t.spacing[2], alignSelf: 'stretch' },
}));
