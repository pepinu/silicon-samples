import { MODELS, type ModelConfig } from '../config.js';

/**
 * Randomly assign a model from the pool using weighted probability.
 * Multi-model ensemble provides human-like inter-model variability
 * and helps detect model-specific biases.
 */
export function assignModel(enabledModelIds?: string[]): ModelConfig {
  let pool = MODELS;
  if (enabledModelIds && enabledModelIds.length > 0) {
    pool = MODELS.filter(m => enabledModelIds.includes(m.id));
    if (pool.length === 0) pool = MODELS;
  }

  const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
  let random = Math.random() * totalWeight;

  for (const model of pool) {
    random -= model.weight;
    if (random <= 0) return model;
  }

  return pool[pool.length - 1];
}

/**
 * Assign models to N personas, ensuring diversity.
 * Returns array of model configs in order.
 */
export function assignModels(count: number, enabledModelIds?: string[]): ModelConfig[] {
  return Array.from({ length: count }, () => assignModel(enabledModelIds));
}
