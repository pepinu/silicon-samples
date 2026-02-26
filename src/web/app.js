// Silicon Samples SPA

// Static mode detection: if /data/experiments.json exists, we're running as a static site
let staticMode = false;
const staticModeCheck = fetch('/data/experiments.json', { method: 'HEAD' })
  .then(r => { staticMode = r.ok; })
  .catch(() => { staticMode = false; });

function staticUrl(url) {
  // Map API URLs to static JSON file paths
  // /api/experiments -> /data/experiments.json
  // /api/experiments/models -> /data/experiments/models.json
  // /api/experiments/question-sets -> /data/experiments/question-sets.json
  // /api/experiments/defaults -> /data/experiments/defaults.json
  // /api/datasets -> /data/datasets.json
  // /api/datasets/:name/distributions -> /data/datasets/:name/distributions.json
  // /api/datasets/:name/samples -> /data/datasets/:name/samples.json
  // /api/analysis/summary -> /data/analysis/summary.json
  // /api/analysis/:id -> /data/analysis/:id.json
  // /api/results/:id/personas -> /data/results/:id/personas.json
  // /api/results/:id/responses -> /data/results/:id/responses.json
  // /api/results/:id/costs -> /data/results/:id/costs.json
  // /api/results/:id/validation -> /data/results/:id/validation.json
  // /api/results/:id/export -> /data/results/:id/export.json
  let path = url.replace(/\?.*$/, ''); // strip query params
  path = path.replace(/^\/api\//, '/data/');
  return path + '.json';
}

const api = {
  async get(url) {
    await staticModeCheck;
    const fetchUrl = staticMode ? staticUrl(url) : url;
    const r = await fetch(fetchUrl);
    return r.json();
  },
  async post(url, data) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r; },
  async del(url) { const r = await fetch(url, { method: 'DELETE' }); return r.json(); },
};

// ---- Navigation ----
const pages = ['dashboard', 'new-experiment', 'datasets', 'results', 'experiment', 'methodology'];
let currentPage = 'dashboard';

document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

function navigateTo(page) {
  currentPage = page;
  pages.forEach(p => {
    document.getElementById(`page-${p}`)?.classList.toggle('hidden', p !== page);
  });
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  if (page === 'dashboard') loadDashboard();
  if (page === 'new-experiment') loadExperimentForm();
  if (page === 'datasets') loadDatasets();
  if (page === 'methodology') loadMethodology();
}

// ---- Dashboard ----
async function loadDashboard() {
  const [experiments, datasets] = await Promise.all([
    api.get('/api/experiments'),
    api.get('/api/datasets'),
  ]);

  document.getElementById('stat-experiments').textContent = experiments.length;
  document.getElementById('stat-datasets').textContent = datasets.length;

  const totalPersonas = experiments.reduce((s, e) => s + (e.persona_count_actual || 0), 0);
  document.getElementById('stat-personas').textContent = totalPersonas;

  const totalCost = experiments.reduce((s, e) => s + (e.total_cost || 0), 0);
  document.getElementById('stat-cost').textContent = `$${totalCost.toFixed(2)}`;

  const listEl = document.getElementById('experiments-list');
  if (experiments.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><h3>No experiments yet</h3><p>Create your first experiment to generate silicon samples</p></div>';
    return;
  }

  listEl.innerHTML = `
    <table>
      <thead><tr>
        <th>Name</th><th>Dataset</th><th>Personas</th><th>Status</th><th>Cost</th><th>Created</th><th></th>
      </tr></thead>
      <tbody>
        ${experiments.map(e => `
          <tr>
            <td><a href="#" onclick="loadExperiment(${e.id}); return false;">${esc(e.name)}</a></td>
            <td>${esc(e.dataset)}</td>
            <td>${e.persona_count_actual || 0}/${e.persona_count}</td>
            <td><span class="badge badge-${statusColor(e.status)}">${e.status}</span></td>
            <td>$${(e.total_cost || 0).toFixed(4)}</td>
            <td>${new Date(e.created_at).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="viewResults(${e.id})">View</button>
              <button class="btn btn-sm btn-danger" onclick="deleteExperiment(${e.id})">Del</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function statusColor(s) {
  if (s === 'completed') return 'success';
  if (s === 'failed' || s === 'cancelled') return 'danger';
  if (s === 'pending') return 'info';
  return 'warning';
}

async function deleteExperiment(id) {
  if (!confirm('Delete this experiment and all its data?')) return;
  await api.del(`/api/experiments/${id}`);
  loadDashboard();
}

// ---- New Experiment Form ----
async function loadExperimentForm() {
  const [datasets, questionSets, models, defaults] = await Promise.all([
    api.get('/api/datasets'),
    api.get('/api/experiments/question-sets'),
    api.get('/api/experiments/models'),
    api.get('/api/experiments/defaults'),
  ]);

  // API key warning
  const form = document.getElementById('experiment-form');
  const existingWarning = document.getElementById('api-key-warning');
  if (existingWarning) existingWarning.remove();
  if (!defaults.apiKeyConfigured) {
    const warning = document.createElement('div');
    warning.id = 'api-key-warning';
    warning.style.cssText = 'background:rgba(239,68,68,0.1);border:1px solid var(--danger);padding:0.75rem 1rem;border-radius:0.375rem;margin-bottom:1rem;color:var(--danger);font-size:0.875rem';
    warning.innerHTML = '<strong>API Key Required:</strong> Add your OpenRouter API key to the <code>.env</code> file before running experiments. Get one at <a href="https://openrouter.ai/keys" style="color:var(--danger)" target="_blank">openrouter.ai/keys</a>';
    form.parentNode.insertBefore(warning, form);
  }

  const dsSelect = document.getElementById('exp-dataset');
  dsSelect.innerHTML = datasets.map(d => `<option value="${d.dataset}">${d.dataset} (${d.count} records)</option>`).join('');

  const qsSelect = document.getElementById('exp-questions');
  qsSelect.innerHTML = questionSets.map(q => `<option value="${q.id}">${q.name} (${q.questions.length} questions)</option>`).join('');

  const modelsDiv = document.getElementById('exp-models');
  modelsDiv.innerHTML = models.map(m => `
    <label><input type="checkbox" value="${m.id}" checked> ${m.name} ($${m.inputCostPer1M}/$${m.outputCostPer1M})</label>
  `).join('');
}

document.getElementById('experiment-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedModels = [...document.querySelectorAll('#exp-models input:checked')].map(i => i.value);
  if (selectedModels.length === 0) { alert('Select at least one model'); return; }

  const personaCount = parseInt(document.getElementById('exp-personas').value);
  if (personaCount < 5) { alert('Minimum 5 personas recommended for meaningful results'); return; }
  if (personaCount < 20 && !confirm(`Small sample size (${personaCount}). Results may not be statistically significant. Continue?`)) return;

  const config = {
    name: document.getElementById('exp-name').value || undefined,
    dataset: document.getElementById('exp-dataset').value,
    personaCount,
    questionSetId: document.getElementById('exp-questions').value,
    temperature: parseFloat(document.getElementById('exp-temp').value),
    budgetLimit: parseFloat(document.getElementById('exp-budget').value),
    modelIds: selectedModels,
  };

  // Show progress panel
  document.getElementById('experiment-progress').classList.remove('hidden');
  document.getElementById('btn-run').disabled = true;
  const logEl = document.getElementById('prog-log');
  logEl.innerHTML = '';

  const addLog = (msg, isError) => {
    const div = document.createElement('div');
    div.className = 'entry' + (isError ? ' error' : '');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  };

  addLog(`Starting experiment: ${config.personaCount} personas, ${selectedModels.length} models`);

  try {
    const response = await fetch('/api/experiments/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    // Handle non-SSE error responses
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      addLog(`Error: ${err.error || response.statusText}`, true);
      document.getElementById('btn-run').disabled = false;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = 'message';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            handleSSE(eventType, data, addLog);
          } catch { /* skip parse errors */ }
        }
      }
    }
  } catch (err) {
    addLog(`Error: ${err.message}`, true);
  } finally {
    document.getElementById('btn-run').disabled = false;
  }
});

function handleSSE(event, data, addLog) {
  if (event === 'progress') {
    const pct = data.totalPersonas > 0 ? Math.round((data.personasInterviewed / data.totalPersonas) * 100) : 0;
    document.getElementById('prog-personas').textContent = `${data.personasInterviewed}/${data.totalPersonas}`;
    document.getElementById('prog-cost').textContent = `$${data.costSoFar.toFixed(4)}`;
    document.getElementById('prog-status').textContent = data.status;
    document.getElementById('prog-bar').style.width = `${pct}%`;

    if (data.currentPersona) addLog(data.currentPersona);
    if (data.errors?.length > 0) data.errors.forEach(e => addLog(e, true));
  }

  if (event === 'complete') {
    addLog(`Experiment ${data.experimentId} completed! Score: ${data.report.overallScore}/100 (${data.report.overallVerdict})`);
    document.getElementById('prog-status').textContent = 'Complete!';
    document.getElementById('prog-bar').style.width = '100%';

    // Auto-navigate to results after a brief pause
    setTimeout(() => viewResults(data.experimentId), 1500);
  }

  if (event === 'error') {
    addLog(`Error: ${data.message}`, true);
    document.getElementById('prog-status').textContent = 'Failed';
  }
}

// ---- Datasets ----
async function loadDatasets() {
  const datasets = await api.get('/api/datasets');
  const el = document.getElementById('datasets-list');

  if (datasets.length === 0) {
    el.innerHTML = '<div class="empty-state"><h3>No datasets loaded</h3><p>Run <code>npm run ingest</code> to load datasets</p></div>';
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr><th>Dataset</th><th>Records</th><th>Avg Age</th><th>Avg Income</th><th></th></tr></thead>
      <tbody>
        ${datasets.map(d => `
          <tr>
            <td>${esc(d.dataset)}</td>
            <td>${d.count.toLocaleString()}</td>
            <td>${Math.round(d.avg_age)}</td>
            <td>$${Math.round(d.avg_income).toLocaleString()}</td>
            <td><button class="btn btn-sm btn-outline" onclick="viewDataset('${d.dataset}')">Explore</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

async function viewDataset(name) {
  const [distributions, samples] = await Promise.all([
    api.get(`/api/datasets/${name}/distributions`),
    api.get(`/api/datasets/${name}/samples?limit=10`),
  ]);

  const detailEl = document.getElementById('dataset-detail');
  detailEl.innerHTML = `
    <div class="card"><h2>${esc(name)} - Distributions</h2>
      <div class="grid grid-2">
        ${distributions.map((d, i) => `
          <div>
            <h3>${esc(d.dimension)} (n=${d.total})</h3>
            <div class="chart-container"><canvas id="dist-chart-${i}"></canvas></div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="card"><h2>Sample Records</h2>
      <table>
        <thead><tr><th>Age</th><th>Education</th><th>Marital</th><th>Income</th><th>Kids</th></tr></thead>
        <tbody>${samples.map(s => `
          <tr><td>${s.age||'-'}</td><td>${s.education||'-'}</td><td>${s.marital_status||'-'}</td><td>${s.income?'$'+s.income.toLocaleString():'-'}</td><td>${s.kids??'-'}</td></tr>
        `).join('')}</tbody>
      </table>
    </div>`;

  // Render charts
  distributions.forEach((d, i) => {
    const ctx = document.getElementById(`dist-chart-${i}`).getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: d.bins.map(b => b.label),
        datasets: [{
          label: d.dimension,
          data: d.bins.map(b => b.proportion * 100),
          backgroundColor: 'rgba(99,102,241,0.6)',
          borderColor: 'rgba(99,102,241,1)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => v + '%', color: '#94a3b8' }, grid: { color: '#334155' } },
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        },
      },
    });
  });
}

// ---- Results ----
window.viewResults = async function(experimentId) {
  navigateTo('results');

  const [experiment, personas, responses, costs, validation] = await Promise.all([
    api.get(`/api/experiments/${experimentId}`),
    api.get(`/api/results/${experimentId}/personas`),
    api.get(`/api/results/${experimentId}/responses`),
    api.get(`/api/results/${experimentId}/costs`),
    api.get(`/api/results/${experimentId}/validation`).catch(() => null),
  ]);

  const el = document.getElementById('results-content');

  const validResponses = responses.filter(r => r.is_valid);
  const likertResponses = validResponses.filter(r => r.question_type === 'likert' && r.likert_value);

  el.innerHTML = `
    <div class="card">
      <h2>${esc(experiment.name)}</h2>
      <div class="grid grid-4">
        <div class="stat-card">
          <div class="value">${personas.length}</div>
          <div class="label">Personas</div>
        </div>
        <div class="stat-card">
          <div class="value">${responses.length}</div>
          <div class="label">Responses</div>
        </div>
        <div class="stat-card">
          <div class="value">$${costs.totalCost.toFixed(4)}</div>
          <div class="label">Total Cost</div>
        </div>
        <div class="stat-card">
          <div class="value">${validation ? validation.overallScore : '-'}/100</div>
          <div class="label">Validation Score</div>
        </div>
      </div>
    </div>

    ${validation ? `
    <div class="card">
      <h2>Validation Report</h2>
      <div style="text-align:center; margin-bottom:1rem">
        <div class="verdict ${validation.overallVerdict}">${validation.overallVerdict.toUpperCase()} (${validation.overallScore}/100)</div>
        <p style="color:var(--text-muted); margin-top:0.5rem">Effective human equivalent: ~${validation.effectiveHumanEquivalent} participants</p>
      </div>

      <h3>Consistency Filtering</h3>
      <p>${validation.filtering.valid}/${validation.filtering.total} responses valid (${(validation.filtering.validRate*100).toFixed(1)}%)</p>
      ${Object.keys(validation.filtering.reasons).length > 0 ? `
        <table>
          <thead><tr><th>Reason</th><th>Count</th></tr></thead>
          <tbody>${Object.entries(validation.filtering.reasons).map(([r,c]) => `<tr><td>${r}</td><td>${c}</td></tr>`).join('')}</tbody>
        </table>
      ` : ''}

      ${validation.distributional.length > 0 ? `
        <h3 style="margin-top:1rem">Distributional Tests</h3>
        <div class="grid grid-2">
          ${validation.distributional.map((d, i) => `
            <div>
              <h3>${esc(d.dimension)} - <span class="badge badge-${d.passed?'success':'danger'}">${d.passed?'PASS':'FAIL'}</span></h3>
              <p>Chi-squared: ${d.chiSquared.statistic.toFixed(2)} (p=${d.chiSquared.pValue.toFixed(4)})</p>
              <p>KL-divergence: ${d.kl.divergence.toFixed(4)} (${d.kl.quality})</p>
              <div class="chart-container"><canvas id="val-chart-${i}"></canvas></div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${validation.biases.length > 0 ? `
        <h3 style="margin-top:1rem">Bias Detection</h3>
        <table>
          <thead><tr><th>Type</th><th>Severity</th><th>Description</th></tr></thead>
          <tbody>${validation.biases.map(b => `
            <tr>
              <td>${b.type.replace(/_/g,' ')}</td>
              <td><span class="badge badge-${b.severity==='high'?'danger':b.severity==='medium'?'warning':b.severity==='low'?'info':'success'}">${b.severity}</span></td>
              <td>${esc(b.description)}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : ''}
    </div>` : ''}

    <div class="card">
      <h2>Cost Breakdown</h2>
      <div class="grid grid-2">
        <div>
          <table>
            <thead><tr><th>Model</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
            <tbody>${costs.byModel.map(m => `
              <tr>
                <td>${esc(m.modelName)}</td>
                <td>${m.callCount}</td>
                <td>${(m.inputTokens+m.outputTokens).toLocaleString()}</td>
                <td>$${m.cost.toFixed(4)}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
        <div class="chart-container"><canvas id="cost-chart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <h2>Response Distribution</h2>
      <div class="grid grid-2">
        <div class="chart-container"><canvas id="likert-chart"></canvas></div>
        <div class="chart-container"><canvas id="model-chart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <h2>Sample Responses</h2>
      <table>
        <thead><tr><th>Persona</th><th>Model</th><th>Question</th><th>Value</th><th>Response</th></tr></thead>
        <tbody>${responses.slice(0, 50).map(r => `
          <tr>
            <td>#${r.persona_id}</td>
            <td>${esc(r.model_id.split('/')[1] || r.model_id)}</td>
            <td>${esc(r.question_id)}</td>
            <td>${r.likert_value ?? r.parsed_value ?? '-'}</td>
            <td title="${esc(r.raw_response)}">${esc(r.raw_response?.substring(0,100))}${r.raw_response?.length>100?'...':''}</td>
          </tr>
        `).join('')}</tbody>
      </table>
      ${responses.length > 50 ? `<p style="color:var(--text-muted);margin-top:0.5rem">Showing 50 of ${responses.length} responses</p>` : ''}
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:2rem">
      <a href="/api/results/${experimentId}/export" class="btn btn-outline">Export JSON</a>
      <a href="/api/results/${experimentId}/export?format=csv" class="btn btn-outline">Export CSV</a>
      <button class="btn btn-outline" onclick="navigateTo('dashboard')">Back to Dashboard</button>
    </div>
  `;

  // Render charts
  renderResultCharts(validation, costs, likertResponses, responses, personas);
};

function renderResultCharts(validation, costs, likertResponses, responses, personas) {
  // Cost pie chart
  if (costs.byModel.length > 0) {
    const ctx = document.getElementById('cost-chart')?.getContext('2d');
    if (ctx) {
      new Chart(ctx, {
        type: 'pie',
        data: {
          labels: costs.byModel.map(m => m.modelName),
          datasets: [{
            data: costs.byModel.map(m => m.cost),
            backgroundColor: ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4'],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } },
        },
      });
    }
  }

  // Likert distribution
  if (likertResponses.length > 0) {
    const counts = [0,0,0,0,0,0,0];
    likertResponses.forEach(r => { if (r.likert_value >= 1 && r.likert_value <= 7) counts[r.likert_value-1]++; });
    const ctx = document.getElementById('likert-chart')?.getContext('2d');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['1','2','3','4','5','6','7'],
          datasets: [{
            label: 'Likert Responses',
            data: counts,
            backgroundColor: 'rgba(99,102,241,0.6)',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Likert Scale Distribution', color: '#e2e8f0' } },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
          },
        },
      });
    }
  }

  // Mean by model
  const modelData = {};
  responses.filter(r => r.likert_value && r.is_valid).forEach(r => {
    const model = r.model_id.split('/')[1] || r.model_id;
    if (!modelData[model]) modelData[model] = [];
    modelData[model].push(r.likert_value);
  });

  const modelNames = Object.keys(modelData);
  if (modelNames.length > 0) {
    const ctx = document.getElementById('model-chart')?.getContext('2d');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: modelNames,
          datasets: [{
            label: 'Mean Likert Score',
            data: modelNames.map(m => {
              const vals = modelData[m];
              return vals.reduce((a,b)=>a+b,0) / vals.length;
            }),
            backgroundColor: ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4'],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Mean Score by Model', color: '#e2e8f0' } },
          scales: {
            y: { min: 1, max: 7, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
          },
        },
      });
    }
  }

  // Validation distributional charts
  if (validation?.distributional) {
    validation.distributional.forEach((d, i) => {
      const ctx = document.getElementById(`val-chart-${i}`)?.getContext('2d');
      if (!ctx) return;
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: d.chiSquared.labels,
          datasets: [
            {
              label: 'Expected (Seed)',
              data: d.chiSquared.expected,
              backgroundColor: 'rgba(99,102,241,0.3)',
              borderColor: 'rgba(99,102,241,1)',
              borderWidth: 1,
            },
            {
              label: 'Observed (Synthetic)',
              data: d.chiSquared.observed,
              backgroundColor: 'rgba(34,197,94,0.3)',
              borderColor: 'rgba(34,197,94,1)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8' } } },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
          },
        },
      });
    });
  }
}

// ---- Helpers ----
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---- Init ----
loadDashboard();
