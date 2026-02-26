import { Router } from 'express';
import { getDb } from '../../data/db.js';
import { getExperimentCost } from '../../experiment/cost-tracker.js';
import { generateReport } from '../../validation/report.js';

export function resultRoutes() {
  const router = Router();

  // Get personas for an experiment
  router.get('/:experimentId/personas', (req, res) => {
    try {
      const db = getDb();
      const personas = db.prepare(`
        SELECT p.*, s.age, s.gender, s.education, s.marital_status, s.income, s.race
        FROM personas p
        LEFT JOIN seed_records s ON p.seed_record_id = s.id
        WHERE p.experiment_id = ?
      `).all(req.params.experimentId);
      res.json(personas);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get responses for an experiment
  router.get('/:experimentId/responses', (req, res) => {
    try {
      const db = getDb();
      const responses = db.prepare(`
        SELECT r.*, p.model_id, p.backstory
        FROM responses r
        JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ?
        ORDER BY p.id, r.id
      `).all(req.params.experimentId);
      res.json(responses);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get cost breakdown
  router.get('/:experimentId/costs', (req, res) => {
    try {
      const costs = getExperimentCost(parseInt(req.params.experimentId));
      res.json(costs);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get validation report
  router.get('/:experimentId/validation', (req, res) => {
    try {
      const report = generateReport(parseInt(req.params.experimentId));
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get stored validations
  router.get('/:experimentId/validations', (req, res) => {
    try {
      const db = getDb();
      const validations = db.prepare(
        'SELECT * FROM validations WHERE experiment_id = ? ORDER BY dimension, metric'
      ).all(req.params.experimentId);
      res.json(validations);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Export experiment data as JSON
  router.get('/:experimentId/export', (req, res) => {
    try {
      const db = getDb();
      const experimentId = req.params.experimentId;

      const experiment = db.prepare('SELECT * FROM experiments WHERE id = ?').get(experimentId);
      const personas = db.prepare(`
        SELECT p.*, s.age, s.education, s.marital_status, s.income, s.race
        FROM personas p
        LEFT JOIN seed_records s ON p.seed_record_id = s.id
        WHERE p.experiment_id = ?
      `).all(experimentId);
      const responses = db.prepare(`
        SELECT r.*, p.model_id
        FROM responses r
        JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ?
      `).all(experimentId);
      const costs = getExperimentCost(parseInt(experimentId));

      let report = null;
      try {
        report = generateReport(parseInt(experimentId));
      } catch { /* may not have enough data */ }

      const format = req.query.format || 'json';
      if (format === 'csv') {
        // CSV export of responses
        const header = 'persona_id,model_id,question_id,question_type,parsed_value,likert_value,is_valid,raw_response\n';
        const rows = (responses as Array<Record<string, unknown>>).map(r =>
          `${r.persona_id},${r.model_id},${r.question_id},${r.question_type},${r.parsed_value ?? ''},${r.likert_value ?? ''},${r.is_valid},"${String(r.raw_response).replace(/"/g, '""')}"`
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=experiment-${experimentId}.csv`);
        res.send(header + rows);
      } else {
        res.json({ experiment, personas, responses, costs, report });
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
