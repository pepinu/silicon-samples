import { PORT } from './config.js';
import { createApp } from './server/app.js';
import { loadAllDatasets } from './data/seed-loader.js';

// Auto-load datasets on startup
console.log('Loading datasets...');
const results = loadAllDatasets();
for (const [name, count] of Object.entries(results)) {
  console.log(`  ${name}: ${count} records`);
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`\nSilicon Samples running at http://localhost:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Try: PORT=${PORT + 1} npm run dev`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
