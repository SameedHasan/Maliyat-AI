import { StyleSheet } from 'react-native';

import { useTheme } from './ThemeProvider';
import { createTheme, type Theme } from './tokens';

/**
 * Builds one stylesheet per colour scheme up front; the returned hook picks the one for
 * the active theme, so components never allocate styles while rendering.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  const sheets = {
    light: StyleSheet.create(factory(createTheme('light'))),
    dark: StyleSheet.create(factory(createTheme('dark'))),
  };
  return function useStyles(): T {
    return sheets[useTheme().scheme];
  };
}
