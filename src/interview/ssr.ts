import { chatCompletion } from './openrouter.js';

/**
 * Semantic Similarity Rating (SSR).
 * Maps open-ended text responses to Likert-scale values using LLM-based similarity rating.
 * Achieves ~90% of human test-retest reliability (PyMC Labs/Colgate-Palmolive 2025).
 */

const SSR_SYSTEM_PROMPT = `You are a precise text classifier. Given a statement and anchor descriptions for a rating scale, rate the text on the scale by outputting ONLY a single number. Do not explain.`;

export interface SSRMapping {
  text: string;
  scale: { min: number; max: number; anchors: Record<number, string> };
  rating: number;
  confidence: number;
}

/**
 * Map an open-ended response to a Likert scale using SSR.
 * Asks the LLM to rate the response 3 times and takes the median for robustness.
 */
export async function mapToLikert(
  text: string,
  scaleAnchors: Record<number, string>,
  options: {
    modelId?: string;
    numRatings?: number;
  } = {}
): Promise<SSRMapping> {
  const {
    modelId = 'deepseek/deepseek-chat', // cheap model for SSR
    numRatings = 3,
  } = options;

  const min = Math.min(...Object.keys(scaleAnchors).map(Number));
  const max = Math.max(...Object.keys(scaleAnchors).map(Number));

  const anchorText = Object.entries(scaleAnchors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');

  const prompt = `Rate the following response on a scale from ${min} to ${max}:

Scale:
${anchorText}

Response to rate:
"${text}"

Output ONLY a single integer from ${min} to ${max}.`;

  const ratings: number[] = [];

  for (let i = 0; i < numRatings; i++) {
    try {
      const result = await chatCompletion(modelId, [
        { role: 'system', content: SSR_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ], { temperature: 0.3, maxTokens: 10 });

      const match = result.content.trim().match(/^(\d+)/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val >= min && val <= max) {
          ratings.push(val);
        }
      }
    } catch {
      // Skip failed ratings
    }
  }

  if (ratings.length === 0) {
    return { text, scale: { min, max, anchors: scaleAnchors }, rating: Math.round((min + max) / 2), confidence: 0 };
  }

  // Take median
  ratings.sort((a, b) => a - b);
  const median = ratings[Math.floor(ratings.length / 2)];

  // Confidence: agreement rate
  const agreement = ratings.filter(r => r === median).length / ratings.length;

  return {
    text,
    scale: { min, max, anchors: scaleAnchors },
    rating: median,
    confidence: agreement,
  };
}
