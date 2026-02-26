import { Router } from 'express';
import { getDatasetStats, loadDataset } from '../../data/seed-loader.js';
import { getAllDistributions, getDistribution } from '../../data/distributions.js';
import { getDb } from '../../data/db.js';

export function datasetRoutes() {
  const router = Router();

  // List all datasets with stats
  router.get('/', (_req, res) => {
    try {
      const stats = getDatasetStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Load a specific dataset
  router.post('/:name/load', (req, res) => {
    try {
      const count = loadDataset(req.params.name);
      res.json({ dataset: req.params.name, recordsLoaded: count });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Get all distributions for a dataset
  router.get('/:name/distributions', (req, res) => {
    try {
      const distributions = getAllDistributions(req.params.name);
      res.json(distributions);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get a specific distribution
  router.get('/:name/distributions/:dimension', (req, res) => {
    try {
      const dist = getDistribution(req.params.name, req.params.dimension);
      res.json(dist);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get sample records
  router.get('/:name/samples', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const db = getDb();
      const records = db.prepare(
        'SELECT id, age, gender, education, marital_status, income, race, occupation, region, kids FROM seed_records WHERE dataset = ? LIMIT ?'
      ).all(req.params.name, limit);
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
