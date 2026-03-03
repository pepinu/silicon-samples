import { getDb } from './db.js';
import type { SampleFilter } from '../persona/sampler.js';

export interface Distribution {
  dimension: string;
  bins: Array<{ label: string; count: number; proportion: number }>;
  total: number;
}

export function getDistribution(dataset: string | string[], dimension: string, filter?: SampleFilter): Distribution {
  const db = getDb();
  const datasets = Array.isArray(dataset) ? dataset : [dataset];

  if (['age', 'income'].includes(dimension)) {
    return getNumericDistribution(db, datasets, dimension, filter);
  }
  return getCategoricalDistribution(db, datasets, dimension, filter);
}

function buildFilterWhereClause(datasets: string[], filter?: SampleFilter): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Dataset filter
  const placeholders = datasets.map(() => '?').join(',');
  conditions.push(`dataset IN (${placeholders})`);
  params.push(...datasets);

  if (filter) {
    // Categorical filters
    for (const col of ['race', 'gender', 'marital_status', 'education', 'region'] as const) {
      const val = filter[col];
      if (val) {
        const arr = Array.isArray(val) ? val : [val];
        conditions.push(`${col} IN (${arr.map(() => '?').join(',')})`);
        params.push(...arr);
      }
    }

    // Numeric range filters
    if (filter.income_min != null) { conditions.push('income >= ?'); params.push(filter.income_min); }
    if (filter.income_max != null) { conditions.push('income < ?'); params.push(filter.income_max); }
    if (filter.age_min != null) { conditions.push('age >= ?'); params.push(filter.age_min); }
    if (filter.age_max != null) { conditions.push('age < ?'); params.push(filter.age_max); }
    if (filter.kids_min != null) { conditions.push('kids >= ?'); params.push(filter.kids_min); }
  }

  return { clause: conditions.join(' AND '), params };
}

function getCategoricalDistribution(db: ReturnType<typeof getDb>, datasets: string[], dimension: string, filter?: SampleFilter): Distribution {
  const allowed = ['gender', 'education', 'marital_status', 'race', 'occupation', 'region'];
  if (!allowed.includes(dimension)) throw new Error(`Invalid dimension: ${dimension}`);

  const { clause, params } = buildFilterWhereClause(datasets, filter);

  const rows = db.prepare(`
    SELECT ${dimension} as label, COUNT(*) as count
    FROM seed_records
    WHERE ${clause} AND ${dimension} IS NOT NULL
    GROUP BY ${dimension}
    ORDER BY count DESC
  `).all(...params) as Array<{ label: string; count: number }>;

  const total = rows.reduce((s, r) => s + r.count, 0);
  return {
    dimension,
    bins: rows.map(r => ({ label: r.label, count: r.count, proportion: total > 0 ? r.count / total : 0 })),
    total,
  };
}

function getNumericDistribution(db: ReturnType<typeof getDb>, datasets: string[], dimension: string, filter?: SampleFilter): Distribution {
  const allowed = ['age', 'income'];
  if (!allowed.includes(dimension)) throw new Error(`Invalid dimension: ${dimension}`);

  const { clause, params } = buildFilterWhereClause(datasets, filter);

  const stats = db.prepare(`
    SELECT MIN(${dimension}) as min_val, MAX(${dimension}) as max_val, COUNT(*) as total
    FROM seed_records
    WHERE ${clause} AND ${dimension} IS NOT NULL
  `).get(...params) as { min_val: number; max_val: number; total: number };

  if (!stats || stats.total === 0) return { dimension, bins: [], total: 0 };

  const binConfigs: Record<string, { boundaries: number[]; labels: string[] }> = {
    age: {
      boundaries: [0, 25, 35, 45, 55, 65, 100],
      labels: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
    },
    income: {
      boundaries: [0, 25000, 50000, 75000, 100000, 150000, Infinity],
      labels: ['<$25K', '$25-50K', '$50-75K', '$75-100K', '$100-150K', '$150K+'],
    },
  };

  const config = binConfigs[dimension];
  const bins = config.labels.map((label, i) => {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM seed_records
      WHERE ${clause} AND ${dimension} >= ? AND ${dimension} < ?
    `).get(...params, config.boundaries[i], config.boundaries[i + 1]) as { count: number };
    return { label, count: row.count, proportion: row.count / stats.total };
  });

  return { dimension, bins, total: stats.total };
}

export function getAllDistributions(dataset: string | string[], filter?: SampleFilter): Distribution[] {
  const dimensions = ['age', 'income', 'education', 'marital_status'];
  return dimensions.map(d => getDistribution(dataset, d, filter));
}
