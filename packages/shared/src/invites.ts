import { LobbyJoinPolicy, LobbyVisibility } from "./types";
import { fetchWithTimeout } from "./http";

export interface InviteInfo {
  valid: boolean;
  roomId?: string;
  lobbyName?: string;
  visibility?: LobbyVisibility;
  joinPolicy?: LobbyJoinPolicy;
  reason?: "not_found" | "closed";
}

/** No auth required — resolving an invite is how a logged-out visitor is
 * meant to reach a lobby in the first place. The actual join still goes
 * through the normal room:join flow and its approval/visibility rules.
 * Throws (rather than returning an "invalid" result) if the server can't be
 * reached at all — that's a different situation from "this invite doesn't
 * exist," and callers should show a different message for it. */
export async function fetchInviteInfo(serverUrl: string, code: string): Promise<InviteInfo> {
  const res = await fetchWithTimeout(`${serverUrl}/invites/${encodeURIComponent(code)}`);
  return res.json();
}
