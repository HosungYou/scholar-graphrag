import { Locale, defaultLocale } from './config';
import ko from './messages/ko.json';
import en from './messages/en.json';

const messages: Record<Locale, typeof ko> = {
  ko,
  en,
};

export function getMessages(locale: Locale = defaultLocale) {
  return messages[locale] || messages[defaultLocale];
}

export function t(key: string, locale: Locale = defaultLocale): string {
  const keys = key.split('.');
  let value: any = messages[locale];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to default locale
      value = messages[defaultLocale];
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object' && fallbackKey in value) {
          value = value[fallbackKey];
        } else {
          return key; // Return key if not found
        }
      }
      break;
    }
  }

  return typeof value === 'string' ? value : key;
}

export * from './config';
