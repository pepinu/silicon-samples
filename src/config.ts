import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const DB_PATH = path.resolve(PROJECT_ROOT, process.env.DB_PATH || 'data/silicon-samples.db');

export const DATASET_DIR = path.resolve(PROJECT_ROOT, 'datasets');

export interface ModelConfig {
  id: string;
  name: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  weight: number; // relative probability of assignment
}

export const MODELS: ModelConfig[] = [
  // Western models
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    inputCostPer1M: 0.50,
    outputCostPer1M: 3.00,
    weight: 2,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku',
    inputCostPer1M: 1.00,
    outputCostPer1M: 5.00,
    weight: 1,
  },
  {
    id: 'mistralai/mistral-small-3.2-24b-instruct',
    name: 'Mistral Small',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.30,
    weight: 1,
  },
  {
    id: 'x-ai/grok-3-mini-beta',
    name: 'Grok 3 Mini',
    inputCostPer1M: 0.30,
    outputCostPer1M: 0.50,
    weight: 1,
  },
  // Chinese models
  {
    id: 'deepseek/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    inputCostPer1M: 0.25,
    outputCostPer1M: 0.40,
    weight: 2,
  },
  {
    id: 'bytedance-seed/seed-2.0-mini',
    name: 'Seed 2.0 Mini',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    weight: 2,
  },
  {
    id: 'minimax/minimax-m2.5-20260211',
    name: 'MiniMax M2.5',
    inputCostPer1M: 0.30,
    outputCostPer1M: 0.30,
    weight: 2,
  },
  {
    id: 'xiaomi/mimo-v2-flash-20251210',
    name: 'Xiaomi MiMo V2',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.10,
    weight: 2,
  },
];

export const DEFAULTS = {
  temperature: 1.0,
  maxConcurrency: 5,
  budgetLimit: 5.00, // USD
  personaCount: 50,
  questionsPerPersona: 8,
};
