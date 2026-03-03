import type { SampleFilter } from '../persona/sampler.js';

export interface ExperimentConfig {
  name: string;
  dataset: string;
  personaCount: number;
  modelIds: string[];
  questionSetId: string;
  temperature: number;
  budgetLimit: number;
  filter?: SampleFilter;
  /** Number of concurrent persona interviews per batch (default: 10) */
  concurrency?: number;
}

export type ExperimentStatus = 'pending' | 'sampling' | 'interviewing' | 'validating' | 'completed' | 'failed' | 'cancelled';

export interface ExperimentProgress {
  status: ExperimentStatus;
  personasGenerated: number;
  personasInterviewed: number;
  totalPersonas: number;
  currentPersona?: string;
  costSoFar: number;
  budgetLimit: number;
  errors: string[];
}
