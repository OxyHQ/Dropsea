import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale } from '@/lib/locale-store';
import { type Strings, stringsFor } from '@/lib/strings';

/** The person's language (as Oxy resolves it) and Dropsea's words in it. */
export function useLocale(): { locale: string; strings: Strings } {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return { locale, strings: stringsFor(locale) };
}
