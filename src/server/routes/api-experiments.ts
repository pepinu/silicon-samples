import { Router } from 'express';
import { getDb } from '../../data/db.js';
import { runExperiment } from '../../experiment/runner.js';
import { getAllQuestionSets } from '../../interview/question-bank.js';
import { MODELS, DEFAULTS, OPENROUTER_API_KEY } from '../../config.js';
import type { ExperimentConfig } from '../../experiment/types.js';

export function experimentRoutes() {
  const router = Router();

  // List all experiments
  router.get('/', (_req, res) => {
    try {
      const db = getDb();
      const experiments = db.prepare(`
        SELECT e.*,
          (SELECT COUNT(*) FROM personas WHERE experiment_id = e.id) as persona_count_actual,
          (SELECT COUNT(*) FROM responses r JOIN personas p ON r.persona_id = p.id WHERE p.experiment_id = e.id) as response_count,
          (SELECT COALESCE(SUM(cost), 0) FROM cost_log WHERE experiment_id = e.id) as total_cost
        FROM experiments e
        ORDER BY e.created_at DESC
      `).all();
      res.json(experiments);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get available models
  router.get('/models', (_req, res) => {
    res.json(MODELS);
  });

  // Get available question sets
  router.get('/question-sets', (_req, res) => {
    res.json(getAllQuestionSets());
  });

  // Get defaults and status info
  router.get('/defaults', (_req, res) => {
    res.json({
      ...DEFAULTS,
      apiKeyConfigured: !!(OPENROUTER_API_KEY && !OPENROUTER_API_KEY.includes('your-key-here')),
    });
  });

  // Create and run an experiment (SSE for progress)
  router.post('/run', (req, res) => {
    try {
      if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('your-key-here')) {
        return res.status(400).json({ error: 'OPENROUTER_API_KEY not configured. Add your key to .env file.' });
      }
      const body = req.body;
      const config: ExperimentConfig = {
        name: body.name || `Experiment ${new Date().toISOString().slice(0, 16)}`,
        dataset: body.dataset || 'kaggle',
        personaCount: body.personaCount || DEFAULTS.personaCount,
        modelIds: body.modelIds || MODELS.map(m => m.id),
        questionSetId: body.questionSetId || 'consumer_preferences',
        temperature: body.temperature ?? DEFAULTS.temperature,
        budgetLimit: body.budgetLimit ?? DEFAULTS.budgetLimit,
      };

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Run experiment asynchronously
      runExperiment(config, (progress) => {
        sendEvent('progress', progress);
      }).then(({ experimentId, report }) => {
        sendEvent('complete', { experimentId, report });
        res.end();
      }).catch((err) => {
        sendEvent('error', { message: (err as Error).message });
        res.end();
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Get single experiment
  router.get('/:id', (req, res) => {
    try {
      const db = getDb();
      const experiment = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
      if (!experiment) return res.status(404).json({ error: 'Not found' });
      res.json(experiment);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Delete experiment
  router.delete('/:id', (req, res) => {
    try {
      const db = getDb();
      const id = req.params.id;
      db.prepare('DELETE FROM cost_log WHERE experiment_id = ?').run(id);
      db.prepare('DELETE FROM validations WHERE experiment_id = ?').run(id);
      db.prepare('DELETE FROM responses WHERE persona_id IN (SELECT id FROM personas WHERE experiment_id = ?)').run(id);
      db.prepare('DELETE FROM personas WHERE experiment_id = ?').run(id);
      db.prepare('DELETE FROM experiments WHERE id = ?').run(id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
