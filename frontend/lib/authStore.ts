"use client";

/**
 * Token storage.
 *
 * SECURITY TRADE-OFF: the backend returns tokens in the JSON response body
 * rather than setting httpOnly cookies, so they have to live somewhere
 * JavaScript can reach. That means any XSS on this origin can steal a session.
 * The stronger design is for /auth/login to set an httpOnly, Secure,
 * SameSite=Strict cookie and for the browser to never see the token at all —
 * worth doing before this handles real patient data.
 *
 * A non-sensitive marker cookie is mirrored alongside so proxy.ts can redirect
 * unauthenticated users on the server, before any protected UI is sent. The
 * cookie holds no token; it is a hint for routing, never for authorization.
 */

const ACCESS_KEY = "physio.access";
const REFRESH_KEY = "physio.refresh";
export const SESSION_COOKIE = "physio.session";

/** Fired when tokens change, so open tabs and hooks can react. */
export const AUTH_EVENT = "physio:auth-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

function setMarkerCookie(present: boolean): void {
  if (!isBrowser()) return;
  if (present) {
    // Session cookie (no Max-Age) so closing the browser clears the hint.
    // Secure is omitted on localhost, where it would stop the cookie sticking.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax${secure}`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

export function setTokens(access: string, refresh: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_KEY, access);
  window.localStorage.setItem(REFRESH_KEY, refresh);
  setMarkerCookie(true);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  setMarkerCookie(false);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function hasTokens(): boolean {
  return getAccessToken() !== null;
}
