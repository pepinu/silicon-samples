import { getDb } from '../data/db.js';

/**
 * Consistency filter: reject implausible, broken, or invalid responses.
 * Checks for:
 * 1. Refusals ("I cannot", "As an AI", etc.)
 * 2. Out-of-range values
 * 3. Character breaks (mentioning being an AI, language model, etc.)
 * 4. Empty or too-short responses
 */

export interface FilterResult {
  personaId: number;
  responseId: number;
  isValid: boolean;
  reason: string | null;
}

const REFUSAL_PATTERNS = [
  /\bi cannot\b/i,
  /\bi can't\b/i,
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi don't have personal/i,
  /\bi'm not able to/i,
  /\bi am not able to/i,
  /\bi don't actually/i,
  /\bi'm an artificial/i,
  /\blarge language model\b/i,
  /\bI don't have experiences\b/i,
  /\bI don't have preferences\b/i,
  /\bI'm just a\b/i,
];

const CHARACTER_BREAK_PATTERNS = [
  /\bOpenAI\b/,
  /\bAnthropic\b/,
  /\bChatGPT\b/,
  /\bClaude\b/,
  /\bGPT-?\d/,
  /\bneural network\b/i,
  /\btrained on\b/i,
  /\bmy training\b/i,
  /\bmy programming\b/i,
];

export function filterResponse(
  raw: string,
  questionType: string,
  parsedValue: number | null,
  scale?: { min: number; max: number }
): { isValid: boolean; reason: string | null } {
  // Empty or too short
  if (!raw || raw.trim().length < 2) {
    return { isValid: false, reason: 'empty_response' };
  }

  // Check for refusals
  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(raw)) {
      return { isValid: false, reason: 'refusal' };
    }
  }

  // Check for character breaks
  for (const pattern of CHARACTER_BREAK_PATTERNS) {
    if (pattern.test(raw)) {
      return { isValid: false, reason: 'character_break' };
    }
  }

  // Check parseable for structured questions
  if (['likert', 'numeric', 'multiple_choice'].includes(questionType) && parsedValue === null) {
    return { isValid: false, reason: 'unparseable' };
  }

  // Range check
  if (parsedValue !== null && scale) {
    if (parsedValue < scale.min || parsedValue > scale.max) {
      return { isValid: false, reason: 'out_of_range' };
    }
  }

  return { isValid: true, reason: null };
}

/**
 * Apply consistency filter to all responses for an experiment.
 * Updates is_valid and rejection_reason in the database.
 */
export function filterExperimentResponses(experimentId: number): {
  total: number;
  valid: number;
  filtered: number;
  reasons: Record<string, number>;
} {
  const db = getDb();

  const responses = db.prepare(`
    SELECT r.id, r.raw_response, r.question_type, r.parsed_value, r.question_id
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ?
  `).all(experimentId) as Array<{
    id: number;
    raw_response: string;
    question_type: string;
    parsed_value: number | null;
    question_id: string;
  }>;

  const reasons: Record<string, number> = {};
  let valid = 0;
  let filtered = 0;

  const update = db.prepare('UPDATE responses SET is_valid = ?, rejection_reason = ? WHERE id = ?');

  const applyAll = db.transaction(() => {
    for (const r of responses) {
      const scale = r.question_type === 'likert' ? { min: 1, max: 7 } :
                    r.question_type === 'numeric' ? { min: 0, max: 1000 } : undefined;

      const result = filterResponse(r.raw_response, r.question_type, r.parsed_value, scale);

      update.run(result.isValid ? 1 : 0, result.reason, r.id);

      if (result.isValid) {
        valid++;
      } else {
        filtered++;
        reasons[result.reason!] = (reasons[result.reason!] || 0) + 1;
      }
    }
  });

  applyAll();

  return { total: responses.length, valid, filtered, reasons };
}
