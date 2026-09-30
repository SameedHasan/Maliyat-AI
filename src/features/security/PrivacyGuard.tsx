import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';

import { usePreferences } from '@/store/preferences';

const KEY = 'maliyat.privacy';

/** Blocks screenshots, screen recording and the recents preview while enabled (FLAG_SECURE). */
export function PrivacyGuard() {
  const enabled = usePreferences((s) => s.blockScreenshots);

  useEffect(() => {
    if (!enabled) return;
    void ScreenCapture.preventScreenCaptureAsync(KEY);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync(KEY);
    };
  }, [enabled]);

  return null;
}
