import { View } from 'react-native';

import { makeStyles } from '@/theme';

export function Divider({ inset = false }: { inset?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.divider, inset && styles.inset]} />;
}

const useStyles = makeStyles((t) => ({
  divider: { height: t.borders.hairline, backgroundColor: t.colors.divider },
  inset: { marginStart: t.spacing[4] + t.iconSizes.lg + t.spacing[3] },
}));
