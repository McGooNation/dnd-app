// Initiative tracker state — pure functions only, no socket/network code here.
// This mutates and returns state objects shaped like:
//
// {
//   panelOpen: boolean,
//   active: boolean,            // has combat been started?
//   round: number,               // 0 when not in combat
//   currentTurnEntryId: string|null,  // tracked by id, not list position —
//                                       // see file header note in server/index.js
//   entries: [ { id, type, refId, name, color, initiative, modifier, hp,
//                maxHp, tempHp, conditions, notes } ]
// }
//
// `modifier`, `hp`, `maxHp`, `tempHp`, `conditions`, `notes` exist on every
// entry today but are unused — reserved so future features (Dexterity
// modifiers, HP tracking, conditions, combat notes) just read/write an
// existing field instead of needing a new entry shape.

const { v4: uuid } = require("uuid");

function defaultInitiativeState() {
  return { panelOpen: false, active: false, round: 0, currentTurnEntryId: null, entries: [] };
}

/** Stable sort, highest initiative first. */
function sortEntries(state) {
  state.entries.sort((a, b) => b.initiative - a.initiative);
}

function blankEntryFields() {
  return { modifier: 0, hp: null, maxHp: null, tempHp: null, conditions: [], notes: "" };
}

/** Adds a connected player to initiative, or updates their value if they're
 * already present — this is what both "Add Player" and "Roll Initiative" use. */
function addOrUpdatePlayerEntry(state, { refId, name, color, initiative }) {
  const existing = state.entries.find((e) => e.type === "player" && e.refId === refId);
  if (existing) {
    existing.name = name;
    existing.initiative = initiative;
  } else {
    state.entries.push({ id: uuid(), type: "player", refId, name, color, initiative, ...blankEntryFields() });
  }
  sortEntries(state);
}

/** Adds a monster/NPC/custom entry — no dedup, multiple "Goblin"s are fine. */
function addCustomEntry(state, { name, initiative }) {
  state.entries.push({
    id: uuid(),
    type: "npc",
    refId: null,
    name: String(name).slice(0, 60),
    initiative: Number(initiative) || 0,
    ...blankEntryFields(),
  });
  sortEntries(state);
}

function removeEntry(state, entryId) {
  state.entries = state.entries.filter((e) => e.id !== entryId);
  if (state.currentTurnEntryId === entryId) {
    state.currentTurnEntryId = state.entries[0]?.id ?? null;
  }
}

function updateEntry(state, entryId, changes) {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return;
  if (typeof changes.name === "string") entry.name = changes.name.slice(0, 60);
  if (typeof changes.initiative === "number" && !Number.isNaN(changes.initiative)) entry.initiative = changes.initiative;
  sortEntries(state);
}

function startCombat(state) {
  if (state.entries.length === 0) return false;
  sortEntries(state);
  state.active = true;
  state.round = 1;
  state.currentTurnEntryId = state.entries[0].id;
  return true;
}

function endCombat(state) {
  state.active = false;
  state.round = 0;
  state.currentTurnEntryId = null;
}

/** direction is "next" or "prev". Tracks by entry id (see file header) so
 * edits to the list mid-combat never desync whose turn is highlighted. */
function advanceTurn(state, direction) {
  if (!state.active || state.entries.length === 0) return;
  sortEntries(state);
  const currentIndex = state.entries.findIndex((e) => e.id === state.currentTurnEntryId);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const lastIndex = state.entries.length - 1;

  if (direction === "next") {
    const nextIndex = safeIndex === lastIndex ? 0 : safeIndex + 1;
    if (nextIndex === 0) state.round += 1;
    state.currentTurnEntryId = state.entries[nextIndex].id;
  } else {
    const prevIndex = safeIndex === 0 ? lastIndex : safeIndex - 1;
    if (safeIndex === 0) state.round = Math.max(1, state.round - 1);
    state.currentTurnEntryId = state.entries[prevIndex].id;
  }
}

module.exports = {
  defaultInitiativeState,
  sortEntries,
  addOrUpdatePlayerEntry,
  addCustomEntry,
  removeEntry,
  updateEntry,
  startCombat,
  endCombat,
  advanceTurn,
};
