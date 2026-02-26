import { getDb } from './db.js';

export interface Distribution {
  dimension: string;
  bins: Array<{ label: string; count: number; proportion: number }>;
  total: number;
}

export function getDistribution(dataset: string, dimension: string): Distribution {
  const db = getDb();

  if (['age', 'income'].includes(dimension)) {
    return getNumericDistribution(db, dataset, dimension);
  }
  return getCategoricalDistribution(db, dataset, dimension);
}

function getCategoricalDistribution(db: ReturnType<typeof getDb>, dataset: string, dimension: string): Distribution {
  const allowed = ['gender', 'education', 'marital_status', 'race', 'occupation', 'region'];
  if (!allowed.includes(dimension)) throw new Error(`Invalid dimension: ${dimension}`);

  const rows = db.prepare(`
    SELECT ${dimension} as label, COUNT(*) as count
    FROM seed_records
    WHERE dataset = ? AND ${dimension} IS NOT NULL
    GROUP BY ${dimension}
    ORDER BY count DESC
  `).all(dataset) as Array<{ label: string; count: number }>;

  const total = rows.reduce((s, r) => s + r.count, 0);
  return {
    dimension,
    bins: rows.map(r => ({ label: r.label, count: r.count, proportion: r.count / total })),
    total,
  };
}

function getNumericDistribution(db: ReturnType<typeof getDb>, dataset: string, dimension: string): Distribution {
  const allowed = ['age', 'income'];
  if (!allowed.includes(dimension)) throw new Error(`Invalid dimension: ${dimension}`);

  const stats = db.prepare(`
    SELECT MIN(${dimension}) as min_val, MAX(${dimension}) as max_val, COUNT(*) as total
    FROM seed_records
    WHERE dataset = ? AND ${dimension} IS NOT NULL
  `).get(dataset) as { min_val: number; max_val: number; total: number };

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
      WHERE dataset = ? AND ${dimension} >= ? AND ${dimension} < ?
    `).get(dataset, config.boundaries[i], config.boundaries[i + 1]) as { count: number };
    return { label, count: row.count, proportion: row.count / stats.total };
  });

  return { dimension, bins, total: stats.total };
}

export function getAllDistributions(dataset: string): Distribution[] {
  const dimensions = ['age', 'income', 'education', 'marital_status'];
  return dimensions.map(d => getDistribution(dataset, d));
}
