import { getDb } from '../data/db.js';
import { MODELS } from '../config.js';

export function trackCost(
  experimentId: number,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = MODELS.find(m => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const cost = (inputTokens / 1_000_000) * model.inputCostPer1M
             + (outputTokens / 1_000_000) * model.outputCostPer1M;

  const db = getDb();
  db.prepare(`
    INSERT INTO cost_log (experiment_id, model_id, input_tokens, output_tokens, cost)
    VALUES (?, ?, ?, ?, ?)
  `).run(experimentId, modelId, inputTokens, outputTokens, cost);

  return cost;
}

export function getExperimentCost(experimentId: number): {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Array<{
    modelId: string;
    modelName: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
  }>;
} {
  const db = getDb();

  const total = db.prepare(`
    SELECT
      COALESCE(SUM(cost), 0) as totalCost,
      COALESCE(SUM(input_tokens), 0) as totalInputTokens,
      COALESCE(SUM(output_tokens), 0) as totalOutputTokens
    FROM cost_log WHERE experiment_id = ?
  `).get(experimentId) as { totalCost: number; totalInputTokens: number; totalOutputTokens: number };

  const byModel = db.prepare(`
    SELECT
      model_id as modelId,
      SUM(cost) as cost,
      SUM(input_tokens) as inputTokens,
      SUM(output_tokens) as outputTokens,
      COUNT(*) as callCount
    FROM cost_log
    WHERE experiment_id = ?
    GROUP BY model_id
  `).all(experimentId) as Array<{
    modelId: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
  }>;

  return {
    ...total,
    byModel: byModel.map(m => ({
      ...m,
      modelName: MODELS.find(mod => mod.id === m.modelId)?.name || m.modelId,
    })),
  };
}

export function checkBudget(experimentId: number, limit: number): { within: boolean; spent: number; remaining: number } {
  const { totalCost } = getExperimentCost(experimentId);
  return {
    within: totalCost < limit,
    spent: totalCost,
    remaining: Math.max(0, limit - totalCost),
  };
}
