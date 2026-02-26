import { getDb } from './data/db.js';

const db = getDb();

console.log('=== UCI: Race distribution ===');
(db.prepare("SELECT race, COUNT(*) as n FROM seed_records WHERE dataset='uci' AND race IS NOT NULL GROUP BY race ORDER BY n DESC").all() as any[]).forEach(r => console.log(' ', r.race, r.n));

console.log('\n=== UCI: Gender distribution ===');
(db.prepare("SELECT gender, COUNT(*) as n FROM seed_records WHERE dataset='uci' AND gender IS NOT NULL GROUP BY gender ORDER BY n DESC").all() as any[]).forEach(r => console.log(' ', r.gender, r.n));

console.log('\n=== BLS: Race distribution ===');
(db.prepare("SELECT race, COUNT(*) as n FROM seed_records WHERE dataset='bls' AND race IS NOT NULL GROUP BY race ORDER BY n DESC").all() as any[]).forEach(r => console.log(' ', r.race, r.n));

console.log('\n=== BLS: Gender distribution ===');
(db.prepare("SELECT gender, COUNT(*) as n FROM seed_records WHERE dataset='bls' AND gender IS NOT NULL GROUP BY gender ORDER BY n DESC").all() as any[]).forEach(r => console.log(' ', r.gender, r.n));

console.log('\n=== BLS: Region distribution ===');
(db.prepare("SELECT region, COUNT(*) as n FROM seed_records WHERE dataset='bls' AND region IS NOT NULL GROUP BY region ORDER BY n DESC").all() as any[]).forEach(r => console.log(' ', r.region, r.n));

console.log('\n=== BLS: Income brackets ===');
(db.prepare(`SELECT CASE WHEN income < 25000 THEN '<25K' WHEN income < 50000 THEN '25-50K' WHEN income < 75000 THEN '50-75K' WHEN income < 100000 THEN '75-100K' ELSE '100K+' END as bracket, COUNT(*) as n FROM seed_records WHERE dataset='bls' AND income IS NOT NULL GROUP BY bracket ORDER BY n DESC`).all() as any[]).forEach(r => console.log(' ', r.bracket, r.n));

console.log('\n=== BLS: Single parents (divorced/single + kids>0) ===');
(db.prepare(`SELECT gender, marital_status, COUNT(*) as n FROM seed_records WHERE dataset='bls' AND marital_status IN ('single','divorced') AND kids > 0 GROUP BY gender, marital_status ORDER BY n DESC`).all() as any[]).forEach(r => console.log(' ', r.gender, r.marital_status, r.n));

console.log('\n=== UCI: Race x Income bracket ===');
(db.prepare(`SELECT race, CASE WHEN income < 35000 THEN 'low' WHEN income < 70000 THEN 'mid' ELSE 'high' END as bracket, COUNT(*) as n FROM seed_records WHERE dataset='uci' GROUP BY race, bracket ORDER BY race, bracket`).all() as any[]).forEach(r => console.log(' ', r.race, r.bracket, r.n));

console.log('\n=== BLS: Education x Race ===');
(db.prepare(`SELECT race, education, COUNT(*) as n FROM seed_records WHERE dataset='bls' AND race IS NOT NULL AND education IS NOT NULL GROUP BY race, education HAVING n > 50 ORDER BY race, n DESC`).all() as any[]).forEach(r => console.log(' ', r.race, r.education, r.n));

process.exit(0);
