import { PublicLobbySummary } from "./types";
import { fetchWithTimeout } from "./http";

/** Requires a logged-in account's token — guests can't browse, per spec. */
export async function fetchPublicLobbies(serverUrl: string, token: string): Promise<PublicLobbySummary[]> {
  const res = await fetchWithTimeout(`${serverUrl}/lobbies/public`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Couldn't load public lobbies.");
  }
  const data = await res.json();
  return data.lobbies;
}
