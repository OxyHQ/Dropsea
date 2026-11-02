import { useAuth } from '@oxy.so/services/ui/client';

/**
 * Who is using Dropsea: the signed-in person whose Oxy Files and albums it
 * shows, once their session can call private APIs.
 */
export function useViewer(): {
  userId: string | null;
  isSignedIn: boolean;
  isResolving: boolean;
  signIn: () => void;
} {
  const { user, isAuthenticated, canUsePrivateApi, isAuthResolved, signIn } = useAuth();
  const userId = user?.id ?? null;
  return {
    userId,
    isSignedIn: isAuthenticated && canUsePrivateApi && userId !== null,
    isResolving: !isAuthResolved,
    signIn: () => {
      signIn().catch((error: unknown) => console.warn('Dropsea could not start signing in', error));
    },
  };
}
