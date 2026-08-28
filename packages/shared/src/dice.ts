import { CUSTOM_DICE_MAX_SIDES, CUSTOM_DICE_MIN_SIDES, DiceType, RollRequest } from "./types";

const DIE_SIDES: Record<string, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

const CUSTOM_DIE_PATTERN = /^d(\d+)$/i;

/**
 * Returns the number of sides for a dice type string. Checks the standard
 * preset table first, then falls back to parsing "dN" for custom dice
 * (e.g. "d37"). Returns null if the string isn't a valid dice type or the
 * side count is out of the allowed range.
 */
export function sidesFor(diceType: DiceType): number | null {
  if (DIE_SIDES[diceType] !== undefined) return DIE_SIDES[diceType];

  const match = CUSTOM_DIE_PATTERN.exec(diceType.trim());
  if (!match) return null;

  const sides = parseInt(match[1], 10);
  if (sides < CUSTOM_DICE_MIN_SIDES || sides > CUSTOM_DICE_MAX_SIDES) return null;
  return sides;
}

/** True if a given dice type string is one of the standard presets. */
export function isPresetDie(diceType: DiceType): boolean {
  return DIE_SIDES[diceType] !== undefined;
}

/** Cryptographically-fine-for-a-game random integer in [1, sides]. */
function rollOne(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// A single roll can combine at most this many different dice groups (e.g.
// "3d4 + 2d6 + 1d8" is 3 groups) — generous for any realistic tabletop use,
// while keeping a request from being able to request an unreasonable number
// of separate groups.
const MAX_DICE_GROUPS = 10;

/** Rolls one complete pass over every dice group — used both for a normal
 * roll and, twice, for advantage/disadvantage (see below). */
function rollGroups(groups: { diceType: DiceType; count: number }[]) {
  const breakdown: { diceType: DiceType; values: number[] }[] = [];
  const allRolls: number[] = [];
  for (const group of groups) {
    const sides = sidesFor(group.diceType)!; // already validated by the caller
    const count = Math.max(1, Math.min(group.count ?? 1, 100)); // same sanity cap as before, per group
    const values = Array.from({ length: count }, () => rollOne(sides));
    breakdown.push({ diceType: group.diceType, values });
    allRolls.push(...values);
  }
  return { breakdown, rolls: allRolls, sum: allRolls.reduce((sum, r) => sum + r, 0) };
}

/**
 * Executes a roll request and returns the individual dice + computed total.
 * IMPORTANT: this should always run on the server, not trusted from a client,
 * or players could just report whatever total they want.
 *
 * A request is one or more "groups" — the primary diceType/count, plus any
 * extraDice groups — each rolled independently and combined into one total.
 * For the common case (no extraDice), this behaves exactly as it always has;
 * `breakdown` is only included when there's genuinely more than one group.
 *
 * Advantage/disadvantage: traditionally a single-d20 mechanic (roll twice,
 * keep the higher/lower single die). Here it's intentionally generalized to
 * work with *any* dice combination — the entire combination (every group,
 * with the modifier applied) is rolled twice as two complete, independent
 * attempts, and the higher (advantage) or lower (disadvantage) COMPLETE
 * TOTAL is used. This is never done per-die (e.g. "1d10 + 1d12" under
 * advantage is never "the higher d10 paired with the higher d12") — always
 * two full attempts, compared as wholes. Both complete attempts are
 * returned (via `advantageRolls`), never just the winner, since TavernTable
 * is built around everyone at the table being able to see what was rolled.
 */
export function executeRoll(request: RollRequest): {
  rolls: number[];
  total: number;
  breakdown?: { diceType: DiceType; values: number[] }[];
  advantageRolls?: { breakdown: { diceType: DiceType; values: number[] }[]; total: number; selected: boolean }[];
} {
  const groups = [{ diceType: request.diceType, count: request.count }, ...(request.extraDice ?? [])];

  if (groups.length > MAX_DICE_GROUPS) {
    throw new Error(`Too many different dice types in one roll — please use ${MAX_DICE_GROUPS} or fewer.`);
  }
  for (const group of groups) {
    if (sidesFor(group.diceType) === null) {
      throw new Error(
        `Invalid dice type "${group.diceType}". Use a preset or a custom die like "d37" between d${CUSTOM_DICE_MIN_SIDES} and d${CUSTOM_DICE_MAX_SIDES}.`
      );
    }
  }

  const modifier = request.modifier ?? 0;

  if (request.mode === "advantage" || request.mode === "disadvantage") {
    const attempt1 = rollGroups(groups);
    const attempt2 = rollGroups(groups);
    const total1 = attempt1.sum + modifier;
    const total2 = attempt2.sum + modifier;
    // Ties are resolved in favor of the first attempt — arbitrary but
    // deterministic, and irrelevant to the actual result since the totals
    // are equal either way.
    const firstWins = request.mode === "advantage" ? total1 >= total2 : total1 <= total2;
    const winner = firstWins ? attempt1 : attempt2;
    const winnerTotal = firstWins ? total1 : total2;

    return {
      // Kept populated (from the winning attempt) so anything that only
      // knows about the older rolls/total/breakdown shape still gets a
      // sensible, correct result — advantageRolls is the new, additive part.
      rolls: winner.rolls,
      total: winnerTotal,
      breakdown: winner.breakdown,
      advantageRolls: [
        { breakdown: attempt1.breakdown, total: total1, selected: firstWins },
        { breakdown: attempt2.breakdown, total: total2, selected: !firstWins },
      ],
    };
  }

  const result = rollGroups(groups);
  const total = result.sum + modifier;

  // Only attach breakdown when there's genuinely more than one group — this
  // is what keeps a normal single-type roll (the overwhelmingly common case)
  // producing the exact same result shape it always has.
  return groups.length > 1 ? { rolls: result.rolls, total, breakdown: result.breakdown } : { rolls: result.rolls, total };
}

/** Assigns a stable-looking but random accent color to a new user. */
const PALETTE = ["#c9a227", "#8b2635", "#3f7a5c", "#4a5d8f", "#a45a3c", "#6b5b95"];
export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}
