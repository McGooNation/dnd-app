// Account (registered user) helpers. Kept separate from the realtime `User`
// type in types.ts, which describes someone present in a room right now
// (guest or account holder, doesn't matter to the server's room logic).

import { fetchWithTimeout } from "./http";

export interface AccountUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: AccountUser;
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "Something went wrong. Please try again.");
  }
  return data;
}

export async function registerAccount(
  serverUrl: string,
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const res = await fetchWithTimeout(`${serverUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return parseJsonOrThrow(res);
}

export async function loginAccount(serverUrl: string, email: string, password: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(`${serverUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJsonOrThrow(res);
}

/** Restores a session from a saved token, e.g. on app launch. Returns null
 * if the token itself is invalid/expired (a normal "you're not logged in"
 * outcome). If the server can't be reached at all, this throws instead of
 * returning null — those are different situations, and a caller showing
 * "please log in" when the real problem is "the server is unreachable"
 * would be misleading. Callers should catch that case separately. */
export async function fetchCurrentUser(serverUrl: string, token: string): Promise<AccountUser | null> {
  const res = await fetchWithTimeout(`${serverUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}
