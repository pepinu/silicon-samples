import { getDb } from './db.js';
import { parseKaggle } from './parsers/kaggle.js';
import { parseUCI } from './parsers/uci.js';
import { parseBLS } from './parsers/bls.js';

export function loadDataset(name: string) {
  const loaders: Record<string, () => Array<{ normalized: Record<string, unknown>; raw: unknown }>> = {
    kaggle: parseKaggle,
    uci: parseUCI,
    bls: parseBLS,
  };

  const loader = loaders[name];
  if (!loader) throw new Error(`Unknown dataset: ${name}. Available: ${Object.keys(loaders).join(', ')}`);

  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM seed_records WHERE dataset = ?').get(name) as { count: number };

  if (existing.count > 0) {
    console.log(`Dataset "${name}" already loaded (${existing.count} records). Skipping.`);
    return existing.count;
  }

  const records = loader();
  if (records.length === 0) {
    console.warn(`No records parsed for dataset "${name}".`);
    return 0;
  }

  const insert = db.prepare(`
    INSERT INTO seed_records (dataset, age, gender, education, marital_status, income, race, occupation, region, kids, household_size, raw_json)
    VALUES (@dataset, @age, @gender, @education, @marital_status, @income, @race, @occupation, @region, @kids, @household_size, @raw_json)
  `);

  const insertMany = db.transaction((items: typeof records) => {
    for (const item of items) {
      insert.run({
        dataset: name,
        age: item.normalized.age ?? null,
        gender: item.normalized.gender ?? null,
        education: item.normalized.education ?? null,
        marital_status: item.normalized.marital_status ?? null,
        income: item.normalized.income ?? null,
        race: item.normalized.race ?? null,
        occupation: item.normalized.occupation ?? null,
        region: item.normalized.region ?? null,
        kids: item.normalized.kids ?? null,
        household_size: item.normalized.household_size ?? null,
        raw_json: JSON.stringify(item.raw),
      });
    }
  });

  insertMany(records);
  console.log(`Loaded ${records.length} records for dataset "${name}".`);
  return records.length;
}

export function loadAllDatasets() {
  const datasets = ['kaggle', 'uci', 'bls'];
  const results: Record<string, number> = {};
  for (const ds of datasets) {
    try {
      results[ds] = loadDataset(ds);
    } catch (err) {
      console.error(`Failed to load dataset "${ds}":`, err);
      results[ds] = 0;
    }
  }
  return results;
}

export function getDatasetStats() {
  const db = getDb();
  const datasets = db.prepare(`
    SELECT dataset, COUNT(*) as count,
      AVG(age) as avg_age,
      AVG(income) as avg_income,
      MIN(income) as min_income,
      MAX(income) as max_income
    FROM seed_records
    GROUP BY dataset
  `).all() as Array<{
    dataset: string;
    count: number;
    avg_age: number;
    avg_income: number;
    min_income: number;
    max_income: number;
  }>;
  return datasets;
}
