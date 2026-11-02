/** Dropsea's configuration, from `EXPO_PUBLIC_*` variables (see `.env.example`). */

/** Oxy's API. */
export const OXY_API_URL = process.env.EXPO_PUBLIC_OXY_API_URL ?? 'https://api.oxy.so';

/** Dropsea's own backend (packages/backend): albums. */
export const DROPSEA_API_URL =
  process.env.EXPO_PUBLIC_DROPSEA_API_URL ?? 'https://api.stash.oxy.so';

/** Dropsea's Oxy client id (its ApplicationCredential publicKey). */
export const OXY_CLIENT_ID = process.env.EXPO_PUBLIC_OXY_CLIENT_ID ?? '';

/**
 * Dropsea's Oxy application id: the application a photo is linked to when it
 * joins an album (`oxy.assets.link`), which is what lets Dropsea's backend read
 * it (oxy ADR 0021).
 */
export const DROPSEA_APPLICATION_ID = process.env.EXPO_PUBLIC_DROPSEA_APPLICATION_ID ?? '';
