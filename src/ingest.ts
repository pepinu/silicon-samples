import { loadAllDatasets, getDatasetStats } from './data/seed-loader.js';
import { closeDb } from './data/db.js';

console.log('Loading datasets...');
const results = loadAllDatasets();
console.log('Results:', results);

const stats = getDatasetStats();
console.log('\nDataset Statistics:');
for (const s of stats) {
  console.log(`  ${s.dataset}: ${s.count} records, avg age ${Math.round(s.avg_age)}, avg income $${Math.round(s.avg_income)}`);
}

closeDb();
