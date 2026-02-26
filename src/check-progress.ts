import { getDb } from './data/db.js';

const db = getDb();

const experiments = db.prepare(`
  SELECT e.id, e.name, e.status, e.persona_count,
    (SELECT COUNT(*) FROM personas WHERE experiment_id = e.id) as personas_created,
    (SELECT COUNT(*) FROM responses r JOIN personas p ON r.persona_id = p.id WHERE p.experiment_id = e.id) as response_count,
    (SELECT COUNT(DISTINCT persona_id) FROM responses r JOIN personas p ON r.persona_id = p.id WHERE p.experiment_id = e.id) as personas_with_responses,
    (SELECT COALESCE(SUM(cost), 0) FROM cost_log WHERE experiment_id = e.id) as total_cost
  FROM experiments e ORDER BY e.id
`).all() as any[];

console.log('\n=== Experiment Progress ===\n');
for (const e of experiments) {
  console.log(`[${e.id}] ${e.name} (${e.status})`);
  console.log(`  Personas: ${e.personas_created}/${e.persona_count}`);
  console.log(`  Interviewed: ${e.personas_with_responses}/${e.personas_created}`);
  console.log(`  Responses: ${e.response_count}`);
  console.log(`  Cost: $${e.total_cost.toFixed(4)}`);
}

const totalCost = db.prepare('SELECT COALESCE(SUM(cost),0) as c FROM cost_log').get() as any;
console.log(`\nTotal cost across all experiments: $${totalCost.c.toFixed(4)}`);

process.exit(0);
