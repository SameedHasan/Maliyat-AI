import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';

export const resources = { en: { translation: en } } as const;
export type SupportedLanguage = keyof typeof resources;

function detectLanguage(): SupportedLanguage {
  const code = getLocales()[0]?.languageCode;
  return code && code in resources ? (code as SupportedLanguage) : 'en';
}

const i18n = createInstance();

// Synchronous init: resources are bundled, so strings are ready before the first render.
void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
});

export default i18n;
