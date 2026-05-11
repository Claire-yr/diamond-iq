// =============================================================================
// Diamond IQ — Option Distractors Generator
// =============================================================================
// Generates 3 distractor options for a multiple-choice drill question.
// Distractors are drawn from:
//   1. The global OPTION_LABELS pool (plausible but wrong for this scenario)
//   2. Position-specific options that are NOT correct for this scenario
//   3. Common mistake descriptions (e.g. "传错垒包", "错误触杀")
// =============================================================================

import {
  OPTION_LABELS,
  correctOptionsByPosition,
  DefensivePosition,
  POSITION_LABELS,
} from '@/lib/engine';

// ─── Common Mistake Descriptions ──────────────────────────────────────────────
// These represent typical wrong decisions players make in the field.
// They are distinct from engine option keys and serve as "trap" distractors.

const COMMON_MISTAKES: Record<string, string> = {
  'throwToWrongBase': '传错垒包（传向无人强迫进垒的垒）',
  'tagInsteadOfForce': '触杀而非封杀（有强迫进垒时应封杀）',
  'forceInsteadOfTag': '封杀而非触杀（无强迫进垒时应触杀）',
  'holdBallTooLong': '持球犹豫过久（应立即传垒）',
  'throwToFirstNoForce': '无强迫时传一垒封杀（跑者已安全）',
  'ignoreDoublePlay': '忽视双杀机会（只完成一出局）',
  'lateThrowHome': '传本垒太迟（跑者已得分）',
  'missTagUp': '未注意跑者回垒起跑',
  'wrongSacrificeCall': '2出局时仍尝试牺牲触击',
  'wildThrow': '传球失误（暴传）',
  'dropBall': '接球失误（漏接）',
  'coverWrongBase': '补位错误（补向不需要的垒）',
  'noBackup': '未补位后方',
  'delayedReaction': '反应迟缓未及时决策',
  'throwToOutfield': '传向外场（无意义的传球）',
  'attemptTriplePlay': '尝试三杀（不现实的目标）',
  'missInfieldFlyRule': '忽视内野高飞规则',
  'noThrowOnUncaughtStrike': '不死三振未传一垒',
  'wrongStealDecision': '错误盗垒判断',
  'badRundown': '夹杀处理不当',
};

// ─── Helper: shuffle array ────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Helper: pick random unique items ─────────────────────────────────────────

function pickRandomUnique<T>(pool: T[], count: number, exclude: Set<T>): T[] {
  const filtered = pool.filter(item => !exclude.has(item));
  const shuffled = shuffleArray(filtered);
  return shuffled.slice(0, count);
}

// ─── Resolve position key (supports Chinese or English) ───────────────────────

function resolvePositionKey(position: string): DefensivePosition | null {
  if (Object.keys(correctOptionsByPosition).includes(position)) {
    return position as DefensivePosition;
  }
  for (const [key, label] of Object.entries(POSITION_LABELS)) {
    if (label === position) return key as DefensivePosition;
  }
  return null;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * generateDistractors: Produces 3 distractor options for a multiple-choice
 * drill question. Distractors are guaranteed to be different from all
 * correctOptions.
 *
 * Strategy:
 *   - First, try position-specific wrong options (plausible for the role
 *     but incorrect for this specific scenario).
 *   - Then, fill from the global OPTION_LABELS pool (options that exist
 *     for other positions/scenarios).
 *   - Finally, fill from COMMON_MISTAKES (generic wrong descriptions).
 *
 * @param correctOptions — The engine's correct options for this scenario
 * @param position       — Defensive position (English key or Chinese label)
 * @returns string[]     — Exactly 3 distractor option keys
 */
export function generateDistractors(
  correctOptions: string[],
  position: string
): string[] {
  const posKey = resolvePositionKey(position);
  const excludeSet = new Set<string>(correctOptions);
  const distractors: string[] = [];

  // ── Tier 1: Position-specific wrong options ──────────────────────────────
  // Options that this position COULD do but are NOT correct for this scenario.
  // These are the most plausible distractors because they're real actions
  // the position might take in other scenarios.

  if (posKey) {
    const positionOpts = correctOptionsByPosition[posKey];
    const positionWrong = positionOpts.filter(opt => !excludeSet.has(opt));
    const picked = pickRandomUnique(positionWrong, 2, excludeSet);
    for (const opt of picked) {
      distractors.push(opt);
      excludeSet.add(opt); // prevent duplicates
    }
  }

  // ── Tier 2: Global option pool ───────────────────────────────────────────
  // Options from other positions/scenarios that sound plausible.

  if (distractors.length < 3) {
    const globalKeys = Object.keys(OPTION_LABELS);
    const needed = 3 - distractors.length;
    const picked = pickRandomUnique(globalKeys, needed, excludeSet);
    for (const opt of picked) {
      distractors.push(opt);
      excludeSet.add(opt);
    }
  }

  // ── Tier 3: Common mistake descriptions ──────────────────────────────────
  // Generic wrong decisions that any position could make.

  if (distractors.length < 3) {
    const mistakeKeys = Object.keys(COMMON_MISTAKES);
    const needed = 3 - distractors.length;
    const picked = pickRandomUnique(mistakeKeys, needed, excludeSet);
    for (const opt of picked) {
      distractors.push(opt);
      excludeSet.add(opt);
    }
  }

  // ── Fallback: guaranteed fill ────────────────────────────────────────────
  // If we still don't have 3 (shouldn't happen with the tiers above),
  // generate synthetic distractors.

  while (distractors.length < 3) {
    const synthetic = `_distractor_${distractors.length + 1}`;
    if (!excludeSet.has(synthetic)) {
      distractors.push(synthetic);
      excludeSet.add(synthetic);
    }
  }

  // Shuffle the final 3 distractors so the ordering is random
  return shuffleArray(distractors);
}

// ─── Get the display label for a distractor ──────────────────────────────────

/**
 * getDistractorLabel: Returns the Chinese display label for any option key,
 * including distractor keys from COMMON_MISTAKES or synthetic ones.
 */
export function getDistractorLabel(key: string): string {
  // Check engine OPTION_LABELS first
  if (OPTION_LABELS[key]) return OPTION_LABELS[key];

  // Check COMMON_MISTAKES
  if (COMMON_MISTAKES[key]) return COMMON_MISTAKES[key];

  // Synthetic fallback
  if (key.startsWith('_distractor_')) return `错误选项 ${key.replace('_distractor_', '')}`;

  // Unknown key — return the key itself
  return key;
}

// ─── Exported constants for external use ──────────────────────────────────────

export { COMMON_MISTAKES };