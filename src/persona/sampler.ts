import { getDb } from '../data/db.js';
import type { SeedRecord } from './types.js';

export interface SampleFilter {
  race?: string | string[];
  gender?: string | string[];
  marital_status?: string | string[];
  education?: string | string[];
  region?: string | string[];
  income_min?: number;
  income_max?: number;
  age_min?: number;
  age_max?: number;
  kids_min?: number;
  /** Allow sampling across multiple datasets */
  datasets?: string[];
}

/**
 * Weighted random sampling of whole records from the seed dataset.
 * Preserves real demographic correlations (e.g., income×education).
 * Supports demographic filtering for targeted subgroup studies.
 */
export function sampleRecords(dataset: string, count: number, filter?: SampleFilter): SeedRecord[] {
  const db = getDb();

  // Build WHERE clause
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Dataset(s)
  if (filter?.datasets && filter.datasets.length > 0) {
    conditions.push(`dataset IN (${filter.datasets.map(() => '?').join(',')})`);
    params.push(...filter.datasets);
  } else {
    conditions.push('dataset = ?');
    params.push(dataset);
  }

  // Categorical filters
  for (const col of ['race', 'gender', 'marital_status', 'education', 'region'] as const) {
    const val = filter?.[col];
    if (val) {
      const arr = Array.isArray(val) ? val : [val];
      conditions.push(`${col} IN (${arr.map(() => '?').join(',')})`);
      params.push(...arr);
    }
  }

  // Numeric range filters
  if (filter?.income_min != null) { conditions.push('income >= ?'); params.push(filter.income_min); }
  if (filter?.income_max != null) { conditions.push('income < ?'); params.push(filter.income_max); }
  if (filter?.age_min != null) { conditions.push('age >= ?'); params.push(filter.age_min); }
  if (filter?.age_max != null) { conditions.push('age < ?'); params.push(filter.age_max); }
  if (filter?.kids_min != null) { conditions.push('kids >= ?'); params.push(filter.kids_min); }

  const where = conditions.join(' AND ');

  const records = db.prepare(`
    SELECT * FROM seed_records
    WHERE ${where}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, count) as SeedRecord[];

  const available = (db.prepare(`SELECT COUNT(*) as n FROM seed_records WHERE ${where}`).get(...params) as { n: number }).n;

  if (records.length < count) {
    console.warn(`Requested ${count} records but only ${available} match filter. Sampling with replacement.`);
    const all = db.prepare(`SELECT * FROM seed_records WHERE ${where}`).all(...params) as SeedRecord[];
    if (all.length === 0) throw new Error(`No records match the filter in dataset "${dataset}"`);

    const result: SeedRecord[] = [];
    for (let i = 0; i < count; i++) {
      result.push(all[Math.floor(Math.random() * all.length)]);
    }
    return result;
  }

  console.log(`Sampled ${records.length} from ${available} matching records`);
  return records;
}
