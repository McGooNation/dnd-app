// Lobby permission roles.
//
// Only "owner" exists today. To add a new role later (e.g. "co-dm" or
// "moderator"), add it to ROLE_PERMISSIONS with its own list of allowed
// actions — nothing else in the app needs to change, since every permission
// check goes through can(role, action) rather than checking role names directly.

const ROLE_PERMISSIONS = {
  owner: ["approveJoin", "declineJoin", "removePlayer", "closeLobby", "manageSettings", "manageInitiative", "manageBattleMap"],
  // Default role for anyone currently in the lobby (guest or account) who
  // isn't specially elevated — grants initiative AND battle map editing to
  // everyone, per the current design. To restrict either to Owner/Co-DM
  // later, remove the relevant action from this list — no other code needs
  // to change.
  member: ["manageInitiative", "manageBattleMap"],
};

function can(role, action) {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}

/** Looks up a connected account's role within a lobby, or null if they're not a member. */
function roleFor(lobby, accountId) {
  if (!lobby || !accountId) return null;
  const member = (lobby.members || []).find((m) => m.accountId === accountId);
  return member ? member.role : null;
}

module.exports = { can, roleFor, ROLE_PERMISSIONS };
