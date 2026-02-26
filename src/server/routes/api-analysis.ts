import { Router } from 'express';
import { getDb } from '../../data/db.js';
import { getExperimentCost } from '../../experiment/cost-tracker.js';
import { getAllDistributions } from '../../data/distributions.js';
import { MODELS } from '../../config.js';

export function analysisRoutes() {
  const router = Router();

  // Aggregate summary across all experiments (for methodology page)
  router.get('/summary', (_req, res) => {
    try {
      const db = getDb();

      const experiments = db.prepare(`
        SELECT e.*,
          (SELECT COUNT(*) FROM personas WHERE experiment_id = e.id) as persona_count_actual,
          (SELECT COALESCE(SUM(cost), 0) FROM cost_log WHERE experiment_id = e.id) as total_cost
        FROM experiments e WHERE e.status = 'completed' ORDER BY e.id
      `).all() as any[];

      const totalPersonas = experiments.reduce((s: number, e: any) => s + (e.persona_count_actual || 0), 0);
      const totalCost = experiments.reduce((s: number, e: any) => s + (e.total_cost || 0), 0);
      const costPerPersona = totalPersonas > 0 ? totalCost / totalPersonas : 0;

      // Total responses and valid rate
      const responseStats = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN r.is_valid = 1 THEN 1 ELSE 0 END) as valid
        FROM responses r
        JOIN personas p ON r.persona_id = p.id
        JOIN experiments e ON p.experiment_id = e.id
        WHERE e.status = 'completed'
      `).get() as any;

      // Total seed records
      const seedStats = db.prepare(`SELECT COUNT(*) as total FROM seed_records`).get() as any;

      // Dataset breakdown
      const datasetBreakdown = db.prepare(`
        SELECT dataset, COUNT(*) as count FROM seed_records GROUP BY dataset ORDER BY count DESC
      `).all() as any[];

      // Per-experiment summary with scores
      const experimentSummaries = experiments.map((e: any) => {
        const config = e.config_json ? JSON.parse(e.config_json) : {};
        const filter = config.filter || {};
        const costs = getExperimentCost(e.id);

        // Get validation results
        const validations = db.prepare(
          'SELECT * FROM validations WHERE experiment_id = ? ORDER BY dimension, metric'
        ).all(e.id) as any[];

        const chiResults = validations.filter((v: any) => v.metric === 'chi_squared');
        const chiPassed = chiResults.filter((v: any) => v.passed).length;

        // Valid rate for this experiment
        const expResponses = db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN r.is_valid = 1 THEN 1 ELSE 0 END) as valid
          FROM responses r JOIN personas p ON r.persona_id = p.id WHERE p.experiment_id = ?
        `).get(e.id) as any;
        const validRate = expResponses.total > 0 ? expResponses.valid / expResponses.total : 0;

        // Seed pool size
        const seedFilterDatasets = filter.datasets || [e.dataset];
        const seedWhereParts: string[] = [`dataset IN (${seedFilterDatasets.map(() => '?').join(',')})`];
        const seedParams: unknown[] = [...seedFilterDatasets];
        for (const col of ['race', 'gender', 'marital_status', 'education', 'region'] as const) {
          const val = filter[col];
          if (val) {
            const arr = Array.isArray(val) ? val : [val];
            seedWhereParts.push(`${col} IN (${arr.map(() => '?').join(',')})`);
            seedParams.push(...arr);
          }
        }
        if (filter.income_min != null) { seedWhereParts.push('income >= ?'); seedParams.push(filter.income_min); }
        if (filter.income_max != null) { seedWhereParts.push('income < ?'); seedParams.push(filter.income_max); }
        const seedPool = (db.prepare(`SELECT COUNT(*) as n FROM seed_records WHERE ${seedWhereParts.join(' AND ')}`).get(...seedParams) as any).n;

        // Simple score estimation (same logic as report.ts)
        let score = 100;
        if (validRate < 0.9) score -= (1 - validRate) * 30;
        if (chiResults.length > 0) score -= (1 - chiPassed / chiResults.length) * 30;
        score = Math.max(0, Math.min(100, Math.round(score)));
        const verdict = score >= 70 ? 'pass' : score >= 50 ? 'marginal' : 'fail';
        const effectiveHumanEquiv = Math.round(e.persona_count * validRate * (score / 100));

        return {
          id: e.id,
          name: e.name,
          dataset: e.dataset,
          personaCount: e.persona_count_actual,
          totalCost: costs.totalCost,
          costPerPersona: costs.totalCost / (e.persona_count_actual || 1),
          validRate,
          chiPassed,
          chiTotal: chiResults.length,
          seedPoolSize: seedPool,
          score,
          verdict,
          effectiveHumanEquiv,
          filter,
          models: JSON.parse(e.model_ids),
        };
      });

      // Model usage across all experiments
      const modelUsage = db.prepare(`
        SELECT p.model_id, COUNT(*) as personas,
          (SELECT COALESCE(SUM(c.cost), 0) FROM cost_log c WHERE c.model_id = p.model_id AND c.experiment_id IN (SELECT id FROM experiments WHERE status = 'completed')) as cost
        FROM personas p
        JOIN experiments e ON p.experiment_id = e.id
        WHERE e.status = 'completed'
        GROUP BY p.model_id
      `).all() as any[];

      res.json({
        totalExperiments: experiments.length,
        totalPersonas,
        totalCost,
        costPerPersona,
        totalResponses: responseStats.total,
        validResponses: responseStats.valid,
        overallValidRate: responseStats.total > 0 ? responseStats.valid / responseStats.total : 0,
        totalSeedRecords: seedStats.total,
        datasetBreakdown,
        experiments: experimentSummaries,
        modelUsage: modelUsage.map((m: any) => ({
          ...m,
          modelName: MODELS.find(mod => mod.id === m.model_id)?.name || m.model_id.split('/')[1],
        })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Full deep-dive data for an experiment
  router.get('/:id', (req, res) => {
    try {
      const db = getDb();
      const id = parseInt(req.params.id);

      const experiment = db.prepare('SELECT * FROM experiments WHERE id = ?').get(id) as any;
      if (!experiment) return res.status(404).json({ error: 'Not found' });

      // --- Metadata ---
      const config = experiment.config_json ? JSON.parse(experiment.config_json) : {};

      // --- Demographics of sampled personas ---
      const demographics = {
        age: db.prepare(`
          SELECT CASE
            WHEN s.age < 25 THEN '18-24' WHEN s.age < 35 THEN '25-34' WHEN s.age < 45 THEN '35-44'
            WHEN s.age < 55 THEN '45-54' WHEN s.age < 65 THEN '55-64' ELSE '65+' END as bin,
            COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.age IS NOT NULL GROUP BY bin
          ORDER BY MIN(s.age)
        `).all(id),
        income: db.prepare(`
          SELECT CASE
            WHEN s.income < 25000 THEN '<$25K' WHEN s.income < 50000 THEN '$25-50K'
            WHEN s.income < 75000 THEN '$50-75K' WHEN s.income < 100000 THEN '$75-100K'
            ELSE '$100K+' END as bin,
            COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.income IS NOT NULL GROUP BY bin
        `).all(id),
        education: db.prepare(`
          SELECT s.education as bin, COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.education IS NOT NULL GROUP BY bin ORDER BY count DESC
        `).all(id),
        marital_status: db.prepare(`
          SELECT s.marital_status as bin, COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.marital_status IS NOT NULL GROUP BY bin ORDER BY count DESC
        `).all(id),
        race: db.prepare(`
          SELECT s.race as bin, COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.race IS NOT NULL GROUP BY bin ORDER BY count DESC
        `).all(id),
        gender: db.prepare(`
          SELECT s.gender as bin, COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.gender IS NOT NULL GROUP BY bin ORDER BY count DESC
        `).all(id),
        region: db.prepare(`
          SELECT s.region as bin, COUNT(*) as count
          FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND s.region IS NOT NULL GROUP BY bin ORDER BY count DESC
        `).all(id),
      };

      // --- Per-question analysis ---
      const questions = db.prepare(`
        SELECT DISTINCT r.question_id, r.question_text, r.question_type
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id NOT LIKE '%_followup'
        ORDER BY r.id
      `).all(id) as Array<{ question_id: string; question_text: string; question_type: string }>;

      const perQuestion = questions.map(q => {
        // Distribution of values
        const valueDist = db.prepare(`
          SELECT r.parsed_value as value, COUNT(*) as count
          FROM responses r JOIN personas p ON r.persona_id = p.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
          GROUP BY r.parsed_value ORDER BY r.parsed_value
        `).all(id, q.question_id) as Array<{ value: number; count: number }>;

        // Stats
        const stats = db.prepare(`
          SELECT AVG(r.parsed_value) as mean, COUNT(*) as n,
            MIN(r.parsed_value) as min_val, MAX(r.parsed_value) as max_val
          FROM responses r JOIN personas p ON r.persona_id = p.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
        `).get(id, q.question_id) as any;

        // Variance (manual since SQLite doesn't have STDDEV)
        const values = db.prepare(`
          SELECT r.parsed_value as v
          FROM responses r JOIN personas p ON r.persona_id = p.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
        `).all(id, q.question_id) as Array<{ v: number }>;
        const mean = stats?.mean || 0;
        const stddev = values.length > 1
          ? Math.sqrt(values.reduce((s, r) => s + Math.pow(r.v - mean, 2), 0) / (values.length - 1))
          : 0;

        // Per-model means
        const byModel = db.prepare(`
          SELECT p.model_id, AVG(r.parsed_value) as mean, COUNT(*) as n
          FROM responses r JOIN personas p ON r.persona_id = p.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
          GROUP BY p.model_id ORDER BY mean DESC
        `).all(id, q.question_id) as Array<{ model_id: string; mean: number; n: number }>;

        // Rejection count
        const rejections = db.prepare(`
          SELECT r.rejection_reason as reason, COUNT(*) as count
          FROM responses r JOIN personas p ON r.persona_id = p.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 0
          GROUP BY r.rejection_reason
        `).all(id, q.question_id) as Array<{ reason: string; count: number }>;

        // Follow-up samples (if exists)
        const followups = db.prepare(`
          SELECT r.raw_response, p.model_id
          FROM responses r JOIN personas p ON r.persona_id = p.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1
          ORDER BY RANDOM() LIMIT 5
        `).all(id, q.question_id + '_followup') as Array<{ raw_response: string; model_id: string }>;

        // Sample responses for this question
        const samples = db.prepare(`
          SELECT r.raw_response, r.parsed_value, r.likert_value, p.model_id, p.backstory,
            s.age, s.income, s.education, s.race, s.gender
          FROM responses r
          JOIN personas p ON r.persona_id = p.id
          LEFT JOIN seed_records s ON p.seed_record_id = s.id
          WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1
          ORDER BY RANDOM() LIMIT 8
        `).all(id, q.question_id) as any[];

        return {
          ...q,
          distribution: valueDist,
          stats: { mean, stddev, n: stats?.n || 0, min: stats?.min_val, max: stats?.max_val },
          byModel: byModel.map(m => ({
            ...m,
            modelName: MODELS.find(mod => mod.id === m.model_id)?.name || m.model_id.split('/')[1],
          })),
          rejections,
          followupSamples: followups,
          responseSamples: samples,
        };
      });

      // --- Filtering summary ---
      const filterSummary = db.prepare(`
        SELECT r.is_valid, r.rejection_reason, COUNT(*) as count
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ?
        GROUP BY r.is_valid, r.rejection_reason ORDER BY count DESC
      `).all(id) as Array<{ is_valid: number; rejection_reason: string | null; count: number }>;

      // Per-model rejection rates
      const modelRejections = db.prepare(`
        SELECT p.model_id, r.is_valid, COUNT(*) as count
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ?
        GROUP BY p.model_id, r.is_valid
      `).all(id) as Array<{ model_id: string; is_valid: number; count: number }>;

      // --- Model distribution (how many personas per model) ---
      const modelDist = db.prepare(`
        SELECT model_id, COUNT(*) as count
        FROM personas WHERE experiment_id = ? GROUP BY model_id ORDER BY count DESC
      `).all(id) as Array<{ model_id: string; count: number }>;

      // --- Validation results ---
      const validations = db.prepare(
        'SELECT * FROM validations WHERE experiment_id = ? ORDER BY dimension, metric'
      ).all(id);

      // --- Cost breakdown ---
      const costs = getExperimentCost(id);

      // --- Backstory samples ---
      const backstorySamples = db.prepare(`
        SELECT p.id, p.model_id, p.backstory, s.age, s.income, s.education, s.marital_status, s.race, s.gender, s.region
        FROM personas p
        LEFT JOIN seed_records s ON p.seed_record_id = s.id
        WHERE p.experiment_id = ? ORDER BY RANDOM() LIMIT 10
      `).all(id) as any[];

      // --- Social desirability: per-question skew ---
      const skewAnalysis = perQuestion
        .filter(q => q.question_type === 'likert' && q.stats.n > 10)
        .map(q => ({
          questionId: q.question_id,
          mean: q.stats.mean,
          midpoint: 4,
          skew: q.stats.mean - 4,
          direction: q.stats.mean > 4.5 ? 'positive' : q.stats.mean < 3.5 ? 'negative' : 'neutral',
        }));

      // --- Response length analysis ---
      const responseLengths = db.prepare(`
        SELECT p.model_id, AVG(LENGTH(r.raw_response)) as avg_length, MIN(LENGTH(r.raw_response)) as min_length, MAX(LENGTH(r.raw_response)) as max_length
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.is_valid = 1
        GROUP BY p.model_id
      `).all(id) as any[];

      // --- Seed vs Synthetic comparison ---
      // Get the full seed distribution for the dataset used, then the filter's subgroup
      const seedDataset = experiment.dataset;
      const filterUsed = config.filter || {};
      const seedFilterDatasets = filterUsed.datasets || [seedDataset];

      // Build seed subgroup demographics (the actual population we're sampling from)
      const seedSubgroupWhere: string[] = [`dataset IN (${seedFilterDatasets.map(() => '?').join(',')})`];
      const seedParams: unknown[] = [...seedFilterDatasets];

      for (const col of ['race', 'gender', 'marital_status', 'education', 'region'] as const) {
        const val = filterUsed[col];
        if (val) {
          const arr = Array.isArray(val) ? val : [val];
          seedSubgroupWhere.push(`${col} IN (${arr.map(() => '?').join(',')})`);
          seedParams.push(...arr);
        }
      }
      if (filterUsed.income_min != null) { seedSubgroupWhere.push('income >= ?'); seedParams.push(filterUsed.income_min); }
      if (filterUsed.income_max != null) { seedSubgroupWhere.push('income < ?'); seedParams.push(filterUsed.income_max); }
      if (filterUsed.age_min != null) { seedSubgroupWhere.push('age >= ?'); seedParams.push(filterUsed.age_min); }
      if (filterUsed.age_max != null) { seedSubgroupWhere.push('age < ?'); seedParams.push(filterUsed.age_max); }
      if (filterUsed.kids_min != null) { seedSubgroupWhere.push('kids >= ?'); seedParams.push(filterUsed.kids_min); }

      const seedWhere = seedSubgroupWhere.join(' AND ');
      const seedTotal = (db.prepare(`SELECT COUNT(*) as n FROM seed_records WHERE ${seedWhere}`).get(...seedParams) as any).n;

      // Seed demographics for comparison
      const seedDemographics: Record<string, Array<{ bin: string; count: number; pct: number }>> = {};

      const dimQueries: Record<string, string> = {
        age: `SELECT CASE WHEN age < 25 THEN '18-24' WHEN age < 35 THEN '25-34' WHEN age < 45 THEN '35-44' WHEN age < 55 THEN '45-54' WHEN age < 65 THEN '55-64' ELSE '65+' END as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND age IS NOT NULL GROUP BY bin ORDER BY MIN(age)`,
        income: `SELECT CASE WHEN income < 25000 THEN '<$25K' WHEN income < 50000 THEN '$25-50K' WHEN income < 75000 THEN '$50-75K' WHEN income < 100000 THEN '$75-100K' ELSE '$100K+' END as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND income IS NOT NULL GROUP BY bin`,
        education: `SELECT education as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND education IS NOT NULL GROUP BY bin ORDER BY count DESC`,
        marital_status: `SELECT marital_status as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND marital_status IS NOT NULL GROUP BY bin ORDER BY count DESC`,
        race: `SELECT race as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND race IS NOT NULL GROUP BY bin ORDER BY count DESC`,
        gender: `SELECT gender as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND gender IS NOT NULL GROUP BY bin ORDER BY count DESC`,
        region: `SELECT region as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND region IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      };

      for (const [dim, sql] of Object.entries(dimQueries)) {
        const rows = db.prepare(sql).all(...seedParams) as Array<{ bin: string; count: number }>;
        const total = rows.reduce((s, r) => s + r.count, 0);
        seedDemographics[dim] = rows.map(r => ({ bin: r.bin, count: r.count, pct: total > 0 ? r.count / total * 100 : 0 }));
      }

      // Seed summary stats
      const seedStats = db.prepare(`
        SELECT AVG(age) as avg_age, AVG(income) as avg_income,
          MIN(age) as min_age, MAX(age) as max_age,
          MIN(income) as min_income, MAX(income) as max_income
        FROM seed_records WHERE ${seedWhere}
      `).get(...seedParams) as any;

      // Synthetic summary stats
      const synthStats = db.prepare(`
        SELECT AVG(s.age) as avg_age, AVG(s.income) as avg_income,
          MIN(s.age) as min_age, MAX(s.age) as max_age,
          MIN(s.income) as min_income, MAX(s.income) as max_income
        FROM personas p JOIN seed_records s ON p.seed_record_id = s.id
        WHERE p.experiment_id = ?
      `).get(id) as any;

      // --- Diagnostic Insights ---
      const diagnostics: Array<{ type: 'success'|'warning'|'error'|'info'; title: string; detail: string }> = [];

      // Valid rate diagnosis
      const totalR = filterSummary.reduce((s, r) => s + r.count, 0);
      const validR = filterSummary.filter(r => r.is_valid === 1).reduce((s, r) => s + r.count, 0);
      const vRate = totalR > 0 ? validR / totalR : 0;
      if (vRate > 0.95) diagnostics.push({ type: 'success', title: 'High validity rate', detail: `${(vRate*100).toFixed(1)}% of responses were valid. The LLMs stayed in character well.` });
      else if (vRate > 0.9) diagnostics.push({ type: 'info', title: 'Good validity rate', detail: `${(vRate*100).toFixed(1)}% valid. Some refusals detected — likely sensitive financial questions where LLMs hedged.` });
      else diagnostics.push({ type: 'warning', title: 'Lower validity rate', detail: `${(vRate*100).toFixed(1)}% valid. High refusal rate suggests the demographic conditioning is triggering safety filters in some models.` });

      // Refusal analysis
      const refusalCount = filterSummary.filter(r => r.rejection_reason === 'refusal').reduce((s, r) => s + r.count, 0);
      if (refusalCount > 20) {
        diagnostics.push({ type: 'warning', title: `${refusalCount} refusals detected`, detail: 'LLMs broke character by saying "I cannot" or "as an AI". This happens more with sensitive demographics. Consider using base models (not chat/RLHF-tuned) or adjusting system prompts.' });
      }

      // Sampling representativeness
      if (seedTotal < 200) {
        diagnostics.push({ type: 'warning', title: 'Small seed subgroup', detail: `Only ${seedTotal} real records match your filter. With a small seed pool, random samples of 100 may not capture the full variance of the population. Consider merging more datasets.` });
      }

      // Chi-squared interpretation
      const chiResults = (validations as any[]).filter(v => v.metric === 'chi_squared');
      const chiFails = chiResults.filter(v => !v.passed);
      if (chiFails.length > 0 && experiment.persona_count <= 100) {
        diagnostics.push({ type: 'info', title: 'Chi-squared failures may be expected', detail: `With only ${experiment.persona_count} personas sampled from ${seedTotal} records, some distributional mismatch is expected purely from sampling noise. A real random sample of 100 from ${seedTotal} would also often fail chi-squared. This is not necessarily an LLM problem.` });
      }

      // Social desirability
      const posSkew = skewAnalysis.filter(s => s.direction === 'positive');
      const negSkew = skewAnalysis.filter(s => s.direction === 'negative');
      if (posSkew.length > negSkew.length + 1) {
        diagnostics.push({ type: 'warning', title: 'Social desirability bias detected', detail: `${posSkew.length}/${skewAnalysis.length} Likert questions skew above midpoint. LLMs tend to give socially desirable answers (brand loyalty, sustainability consciousness). This is the #1 known LLM bias — RLHF training rewards agreeable responses. Mitigation: use lower temperature, base models, or post-hoc calibration.` });
      } else if (negSkew.length > posSkew.length + 1) {
        diagnostics.push({ type: 'warning', title: 'Negative skew detected', detail: `${negSkew.length}/${skewAnalysis.length} questions skew below midpoint. The LLMs may be overcorrecting for the demographic — producing more pessimistic/stressed responses than real data suggests. This "poverty caricaturing" effect is documented in Sarstedt et al.` });
      } else if (skewAnalysis.length > 0) {
        diagnostics.push({ type: 'success', title: 'Balanced response distribution', detail: 'Likert responses are reasonably balanced around the midpoint. No strong evidence of systematic social desirability bias.' });
      }

      // Model diversity
      if (modelDist.length < 3) {
        diagnostics.push({ type: 'info', title: 'Low model diversity', detail: 'Fewer than 3 models used. Multi-model ensembles provide better human-like variance and allow cross-model validation.' });
      }

      // Per-model insight
      const modelMeans: Record<string, { sum: number; n: number }> = {};
      perQuestion.filter(q => q.question_type === 'likert').forEach(q => {
        q.byModel.forEach((m: any) => {
          const name = m.modelName;
          if (!modelMeans[name]) modelMeans[name] = { sum: 0, n: 0 };
          modelMeans[name].sum += m.mean * m.n;
          modelMeans[name].n += m.n;
        });
      });
      const modelAvgs = Object.entries(modelMeans).map(([name, v]) => ({ name, avg: v.sum / v.n })).sort((a, b) => b.avg - a.avg);
      if (modelAvgs.length >= 2) {
        const range = modelAvgs[0].avg - modelAvgs[modelAvgs.length - 1].avg;
        if (range > 0.5) {
          diagnostics.push({ type: 'info', title: `Model spread: ${range.toFixed(2)} points`, detail: `${modelAvgs[0].name} is the most optimistic (mean ${modelAvgs[0].avg.toFixed(2)}), ${modelAvgs[modelAvgs.length-1].name} is most conservative (${modelAvgs[modelAvgs.length-1].avg.toFixed(2)}). This inter-model variance is actually desirable — it mimics real human heterogeneity.` });
        }
      }

      res.json({
        experiment,
        config,
        demographics,
        perQuestion,
        filterSummary,
        modelRejections,
        modelDist: modelDist.map(m => ({
          ...m,
          modelName: MODELS.find(mod => mod.id === m.model_id)?.name || m.model_id.split('/')[1],
        })),
        validations,
        costs,
        backstorySamples,
        skewAnalysis,
        responseLengths: responseLengths.map(r => ({
          ...r,
          modelName: MODELS.find(m => m.id === r.model_id)?.name || r.model_id.split('/')[1],
        })),
        seedComparison: {
          seedTotal,
          seedDemographics,
          seedStats,
          synthStats,
        },
        diagnostics,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
