import express from 'express';
import path from 'path';
import { PROJECT_ROOT } from '../config.js';
import { datasetRoutes } from './routes/api-datasets.js';
import { experimentRoutes } from './routes/api-experiments.js';
import { resultRoutes } from './routes/api-results.js';
import { analysisRoutes } from './routes/api-analysis.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(PROJECT_ROOT, 'src', 'web')));

  // API routes
  app.use('/api/datasets', datasetRoutes());
  app.use('/api/experiments', experimentRoutes());
  app.use('/api/results', resultRoutes());
  app.use('/api/analysis', analysisRoutes());

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'src', 'web', 'index.html'));
  });

  return app;
}
