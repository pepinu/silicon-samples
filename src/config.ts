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
  {
    id: 'mistralai/mistral-small-3.2-24b-instruct',
    name: 'Mistral Small',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.30,
    weight: 3,
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    inputCostPer1M: 0.32,
    outputCostPer1M: 0.89,
    weight: 3,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini Flash',
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.50,
    weight: 2,
  },
  {
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    inputCostPer1M: 0.40,
    outputCostPer1M: 1.60,
    weight: 1,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku',
    inputCostPer1M: 1.00,
    outputCostPer1M: 5.00,
    weight: 1,
  },
];

export const DEFAULTS = {
  temperature: 1.0,
  maxConcurrency: 5,
  budgetLimit: 5.00, // USD
  personaCount: 50,
  questionsPerPersona: 8,
};
