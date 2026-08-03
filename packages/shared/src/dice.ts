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

/**
 * Executes a roll request and returns the individual dice + computed total.
 * IMPORTANT: this should always run on the server, not trusted from a client,
 * or players could just report whatever total they want.
 */
export function executeRoll(request: RollRequest): { rolls: number[]; total: number } {
  const sides = sidesFor(request.diceType);
  if (sides === null) {
    throw new Error(
      `Invalid dice type "${request.diceType}". Use a preset or a custom die like "d37" between d${CUSTOM_DICE_MIN_SIDES} and d${CUSTOM_DICE_MAX_SIDES}.`
    );
  }
  const count = Math.max(1, Math.min(request.count ?? 1, 100)); // sanity cap
  const modifier = request.modifier ?? 0;

  if (request.mode === "advantage" || request.mode === "disadvantage") {
    // Advantage/disadvantage is a single-die d20 mechanic: roll twice, keep one.
    const a = rollOne(sides);
    const b = rollOne(sides);
    const chosen = request.mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
    return { rolls: [a, b], total: chosen + modifier };
  }

  const rolls = Array.from({ length: count }, () => rollOne(sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { rolls, total };
}

/** Assigns a stable-looking but random accent color to a new user. */
const PALETTE = ["#c9a227", "#8b2635", "#3f7a5c", "#4a5d8f", "#a45a3c", "#6b5b95"];
export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}
