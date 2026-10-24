import "../static/game-goal-data.js";

export function gameGoals(raw, gameId) {
  return globalThis.GameGoalData.normalizeLanding(raw, gameId);
}
export function normalizeScoreGoals(raw) {
  return globalThis.GameGoalData.normalizeScore(raw);
}
