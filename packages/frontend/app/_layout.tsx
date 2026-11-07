import '../global.css';

import { OverlayInertBoundary, PortalOutlet, PortalProvider } from '@oxy.so/bloom/portal';
import { BloomProvider } from '@oxy.so/bloom/provider';
import { OxyProvider } from '@oxy.so/services/ui/client';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OXY_CLIENT_ID } from '@/lib/config';
import { setLocale } from '@/lib/locale-store';
import { oxyServices } from '@/lib/oxy';
import { queryClient } from '@/lib/query-client';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@/lib/strings';

/**
 * Dropsea's providers. The platform's adapter (OxyOS's windows, menu bar and the
 * person's places and Trash) is registered around this by the runtime that
 * runs Dropsea; Dropsea's own BloomProvider keeps it. Oxy resolves the person's
 * language and Dropsea speaks it.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BloomProvider>
          <OxyProvider
            oxyServices={oxyServices}
            clientId={OXY_CLIENT_ID}
            queryClient={queryClient}
            language={{
              supportedLocales: SUPPORTED_LOCALES,
              fallbackLocale: FALLBACK_LOCALE,
              onChange: setLocale,
              onError: (error, locale) =>
                console.warn('Dropsea could not follow the language Oxy resolved', {
                  locale,
                  error,
                }),
            }}
          >
            {/* Bloom's portaled surfaces on native (Settings' modal among them) paint in the
                outlet, after the content they cover; the boundary hides that content from a
                screen reader while a modal one is open (Bloom's docs/portal.mdx). */}
            <PortalProvider>
              <OverlayInertBoundary>
                <Slot />
              </OverlayInertBoundary>
              <PortalOutlet />
            </PortalProvider>
          </OxyProvider>
        </BloomProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
