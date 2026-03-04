// Experiment deep-dive page
// Called via loadExperiment(id) from app.js

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7','#ec4899','#84cc16'];
const MODEL_COLORS = {
  'Mistral Small': '#6366f1',
  'DeepSeek V3': '#22c55e',
  'Gemini Flash': '#f59e0b',
  'GPT-4.1 Mini': '#ef4444',
  'Claude Haiku': '#06b6d4',
};

// Keep chart instances for cleanup
let experimentCharts = [];

function destroyExperimentCharts() {
  experimentCharts.forEach(c => c.destroy());
  experimentCharts = [];
}

function makeChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const chart = new Chart(el.getContext('2d'), config);
  experimentCharts.push(chart);
  return chart;
}

function modelShort(id) {
  return id?.split('/')[1]?.replace(/-/g, ' ') || id;
}

function modelColor(name) {
  return MODEL_COLORS[name] || '#94a3b8';
}

function buildSeedVsSynthCharts(data) {
  return ['age','income','education','marital_status','race','gender','region'].map((dim, i) => {
    const seed = data.seedComparison.seedDemographics[dim];
    const synth = data.demographics[dim];
    if ((!seed || seed.length === 0) && (!synth || synth.length === 0)) return '';
    return '<div><h3 style="font-size:0.9rem">' + dim.replace(/_/g, ' ') + '</h3><div class="chart-container" style="height:220px"><canvas id="exp-seed-vs-' + i + '"></canvas></div></div>';
  }).join('');
}

function buildDiagnosticsSection(data) {
  if (!data.diagnostics || data.diagnostics.length === 0) return '';
  var html = '<div class="card"><h2>Diagnostics & Insights</h2>';
  html += '<p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">Automated analysis of what went well, what didn\'t, and why — covering LLM behavior, sampling quality, and known biases.</p>';
  data.diagnostics.forEach(function(d) {
    var borderColor = d.type === 'success' ? 'var(--success)' : d.type === 'warning' ? 'var(--warning)' : d.type === 'error' ? 'var(--danger)' : 'var(--primary)';
    var badgeBg = d.type === 'success' ? 'rgba(34,197,94,0.15);color:var(--success)' : d.type === 'warning' ? 'rgba(245,158,11,0.15);color:var(--warning)' : d.type === 'error' ? 'rgba(239,68,68,0.15);color:var(--danger)' : 'rgba(99,102,241,0.15);color:var(--primary)';
    html += '<div style="background:var(--bg);border-left:4px solid ' + borderColor + ';border-radius:0.375rem;padding:0.875rem 1rem;margin-bottom:0.75rem">';
    html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.375rem">';
    html += '<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;background:' + badgeBg + '">' + d.type.toUpperCase() + '</span>';
    html += '<strong style="font-size:0.9375rem">' + esc(d.title) + '</strong>';
    html += '</div>';
    html += '<p style="color:var(--text-muted);font-size:0.8125rem;margin:0;line-height:1.5">' + esc(d.detail) + '</p>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

window.loadExperiment = async function(id) {
  destroyExperimentCharts();
  navigateTo('experiment');

  const el = document.getElementById('experiment-content');
  el.innerHTML = '<div style="text-align:center;padding:3rem"><div class="spinner"></div><p style="margin-top:1rem;color:var(--text-muted)">Loading deep analysis...</p></div>';

  const data = await api.get(`/api/analysis/${id}`);
  const exp = data.experiment;
  const cfg = data.config;

  const totalResponses = data.filterSummary.reduce((s, r) => s + r.count, 0);
  const validResponses = data.filterSummary.filter(r => r.is_valid === 1).reduce((s, r) => s + r.count, 0);
  const invalidResponses = totalResponses - validResponses;
  const validRate = totalResponses > 0 ? (validResponses / totalResponses * 100).toFixed(1) : 0;

  // Build validation summary
  let valHtml = '';
  if (data.validations.length > 0) {
    const byDim = {};
    data.validations.forEach(v => {
      if (!byDim[v.dimension]) byDim[v.dimension] = {};
      byDim[v.dimension][v.metric] = v;
    });
    valHtml = Object.entries(byDim).map(([dim, metrics]) => {
      const chi = metrics.chi_squared;
      const kl = metrics.kl_divergence;
      const passed = chi?.passed;
      return `<tr>
        <td>${dim.replace(/_/g, ' ')}</td>
        <td>${chi ? chi.value.toFixed(2) : '-'}</td>
        <td>${chi ? chi.p_value.toFixed(4) : '-'}</td>
        <td>${kl ? kl.value.toFixed(4) : '-'}</td>
        <td><span class="badge badge-${passed ? 'success' : 'danger'}">${passed ? 'PASS' : 'FAIL'}</span></td>
      </tr>`;
    }).join('');
  }

  // Question option labels for MC questions
  const MC_OPTIONS = {
    cp_grocery_budget: ['Under $200', '$200-$400', '$400-$600', '$600-$800', 'Over $800'],
    cp_impulse_buying: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very often'],
    cp_sustainable_premium: ['No, price matters', 'Maybe 10% more', 'Yes 25% more', 'Yes 50% more', 'Regardless of cost'],
    fa_saving_rate: ['0%', '1-5%', '6-10%', '11-20%', 'Over 20%'],
    fa_spending_priority: ['Experiences', 'Things', 'Savings', 'Education', 'Family'],
    fa_retirement_confidence: ['Not at all', 'Slightly', 'Somewhat', 'Fairly', 'Very'],
    fa_luxury_spending: ['Under $50', '$50-150', '$150-300', '$300-500', 'Over $500'],
    fa_economic_outlook: ['Very pessimistic', 'Somewhat pessimistic', 'Neutral', 'Somewhat optimistic', 'Very optimistic'],
    ta_social_media: ['None', '<1 hour', '1-2 hours', '2-4 hours', '4+ hours'],
    ta_smart_home: ['None', '1-2', '3-5', '6-10', '10+'],
    ta_tech_budget: ['Under $200', '$200-500', '$500-1000', '$1000-2000', 'Over $2000'],
  };

  el.innerHTML = `
    <!-- Header -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <h2 style="margin-bottom:0.25rem">${esc(exp.name)}</h2>
          <p style="color:var(--text-muted);font-size:0.875rem">
            ${esc(exp.dataset)} dataset &middot; ${exp.persona_count} personas &middot; ${exp.question_set} questions &middot;
            temp=${exp.temperature} &middot; ${new Date(exp.created_at).toLocaleString()}
          </p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="navigateTo('results')">Back</button>
      </div>
    </div>

    <!-- Methodology -->
    <div class="card">
      <h2>Methodology</h2>
      <div class="grid grid-2">
        <div>
          <h3>Experiment Design</h3>
          <table>
            <tr><td style="color:var(--text-muted)">Personas</td><td>${exp.persona_count}</td></tr>
            <tr><td style="color:var(--text-muted)">Seed Dataset</td><td>${esc(exp.dataset)}</td></tr>
            <tr><td style="color:var(--text-muted)">Question Set</td><td>${esc(exp.question_set)}</td></tr>
            <tr><td style="color:var(--text-muted)">Temperature</td><td>${exp.temperature}</td></tr>
            <tr><td style="color:var(--text-muted)">Budget Limit</td><td>$${exp.budget_limit}</td></tr>
            <tr><td style="color:var(--text-muted)">Filter</td><td><code>${cfg.filter ? JSON.stringify(cfg.filter) : 'none'}</code></td></tr>
          </table>
        </div>
        <div>
          <h3>Model Ensemble</h3>
          <div class="chart-container" style="height:200px"><canvas id="exp-model-dist"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Cost & Performance -->
    <div class="card">
      <h2>Cost & Performance</h2>
      <div class="grid grid-4">
        <div class="stat-card">
          <div class="value">$${data.costs.totalCost.toFixed(4)}</div>
          <div class="label">Total Cost</div>
        </div>
        <div class="stat-card">
          <div class="value">${(data.costs.totalInputTokens + data.costs.totalOutputTokens).toLocaleString()}</div>
          <div class="label">Total Tokens</div>
        </div>
        <div class="stat-card">
          <div class="value">${validRate}%</div>
          <div class="label">Valid Response Rate</div>
        </div>
        <div class="stat-card">
          <div class="value">$${(data.costs.totalCost / exp.persona_count).toFixed(4)}</div>
          <div class="label">Cost per Persona</div>
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:1rem">
        <div>
          <h3>Cost by Model</h3>
          <table>
            <thead><tr><th>Model</th><th>Personas</th><th>API Calls</th><th>Tokens</th><th>Cost</th><th>$/Persona</th></tr></thead>
            <tbody>${data.costs.byModel.map(m => {
              const personaCount = data.modelDist.find(d => d.model_id === m.modelId)?.count || '?';
              return `<tr>
                <td><span style="color:${modelColor(m.modelName)}">${esc(m.modelName)}</span></td>
                <td>${personaCount}</td>
                <td>${m.callCount}</td>
                <td>${(m.inputTokens+m.outputTokens).toLocaleString()}</td>
                <td>$${m.cost.toFixed(4)}</td>
                <td>$${(m.cost / (personaCount || 1)).toFixed(4)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
        <div>
          <h3>Response Length by Model</h3>
          <div class="chart-container" style="height:200px"><canvas id="exp-resp-length"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Demographics of Sampled Personas -->
    <div class="card">
      <h2>Demographics of Sampled Personas</h2>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">These are the actual real-data demographics that the ${exp.persona_count} synthetic personas were conditioned on.</p>
      <div class="grid grid-2">
        ${['age','income','education','marital_status','race','gender','region'].map((dim, i) => {
          const d = data.demographics[dim];
          if (!d || d.length === 0) return '';
          return `<div>
            <h3>${dim.replace(/_/g, ' ')}</h3>
            <div class="chart-container" style="height:200px"><canvas id="exp-demo-${i}"></canvas></div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Seed vs Synthetic Comparison -->
    ${data.seedComparison ? `
    <div class="card">
      <h2>Real Population vs Synthetic Sample</h2>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">
        Side-by-side comparison of the <strong>real seed subgroup</strong> (${data.seedComparison.seedTotal.toLocaleString()} matching records) vs the <strong>sampled personas</strong> (${exp.persona_count}).
        Differences show sampling effects, not LLM bias — the LLM receives these demographics as input.
      </p>

      <!-- Summary stats comparison -->
      <div class="grid grid-2" style="margin-bottom:1.5rem">
        <div>
          <h3>Real Seed Population</h3>
          <table>
            <tr><td style="color:var(--text-muted)">Records matching filter</td><td>${data.seedComparison.seedTotal.toLocaleString()}</td></tr>
            <tr><td style="color:var(--text-muted)">Avg Age</td><td>${data.seedComparison.seedStats?.avg_age ? Math.round(data.seedComparison.seedStats.avg_age) : '-'}</td></tr>
            <tr><td style="color:var(--text-muted)">Avg Income</td><td>${data.seedComparison.seedStats?.avg_income ? '$'+Math.round(data.seedComparison.seedStats.avg_income).toLocaleString() : '-'}</td></tr>
            <tr><td style="color:var(--text-muted)">Age Range</td><td>${data.seedComparison.seedStats?.min_age || '-'} - ${data.seedComparison.seedStats?.max_age || '-'}</td></tr>
            <tr><td style="color:var(--text-muted)">Income Range</td><td>${data.seedComparison.seedStats?.min_income ? '$'+Math.round(data.seedComparison.seedStats.min_income).toLocaleString() : '-'} - ${data.seedComparison.seedStats?.max_income ? '$'+Math.round(data.seedComparison.seedStats.max_income).toLocaleString() : '-'}</td></tr>
          </table>
        </div>
        <div>
          <h3>Synthetic Sample</h3>
          <table>
            <tr><td style="color:var(--text-muted)">Personas sampled</td><td>${exp.persona_count}</td></tr>
            <tr><td style="color:var(--text-muted)">Avg Age</td><td>${data.seedComparison.synthStats?.avg_age ? Math.round(data.seedComparison.synthStats.avg_age) : '-'}</td></tr>
            <tr><td style="color:var(--text-muted)">Avg Income</td><td>${data.seedComparison.synthStats?.avg_income ? '$'+Math.round(data.seedComparison.synthStats.avg_income).toLocaleString() : '-'}</td></tr>
            <tr><td style="color:var(--text-muted)">Age Range</td><td>${data.seedComparison.synthStats?.min_age || '-'} - ${data.seedComparison.synthStats?.max_age || '-'}</td></tr>
            <tr><td style="color:var(--text-muted)">Income Range</td><td>${data.seedComparison.synthStats?.min_income ? '$'+Math.round(data.seedComparison.synthStats.min_income).toLocaleString() : '-'} - ${data.seedComparison.synthStats?.max_income ? '$'+Math.round(data.seedComparison.synthStats.max_income).toLocaleString() : '-'}</td></tr>
          </table>
        </div>
      </div>

      <h3>Demographic Distributions: Real vs Synthetic</h3>
      <div class="grid grid-2">
        ${buildSeedVsSynthCharts(data)}
      </div>
    </div>` : ''}

    <!-- Diagnostics & Insights -->
    ${buildDiagnosticsSection(data)}

    <!-- Consistency Filtering -->
    <div class="card">
      <h2>Consistency Filtering</h2>
      <div class="grid grid-2">
        <div>
          <h3>Filter Results</h3>
          <div class="grid grid-3">
            <div class="stat-card">
              <div class="value" style="color:var(--success)">${validResponses}</div>
              <div class="label">Valid</div>
            </div>
            <div class="stat-card">
              <div class="value" style="color:var(--danger)">${invalidResponses}</div>
              <div class="label">Filtered Out</div>
            </div>
            <div class="stat-card">
              <div class="value">${totalResponses}</div>
              <div class="label">Total</div>
            </div>
          </div>
          <table style="margin-top:1rem">
            <thead><tr><th>Reason</th><th>Count</th><th>%</th></tr></thead>
            <tbody>
              ${data.filterSummary.filter(f => !f.is_valid && f.rejection_reason).map(f => `
                <tr><td>${f.rejection_reason}</td><td>${f.count}</td><td>${(f.count/totalResponses*100).toFixed(1)}%</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Rejection Rate by Model</h3>
          <div class="chart-container" style="height:200px"><canvas id="exp-rejection-model"></canvas></div>
        </div>
      </div>
    </div>

    <!-- Validation Tests -->
    ${data.validations.length > 0 ? `
    <div class="card">
      <h2>Statistical Validation</h2>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">Tests whether the synthetic persona demographics match the seed data distribution. Chi-squared p&gt;0.05 and KL&lt;0.2 = pass.</p>
      <table>
        <thead><tr><th>Dimension</th><th>Chi-squared</th><th>p-value</th><th>KL-divergence</th><th>Verdict</th></tr></thead>
        <tbody>${valHtml}</tbody>
      </table>
    </div>` : ''}

    <!-- Social Desirability Analysis -->
    ${data.skewAnalysis.length > 0 ? `
    <div class="card">
      <h2>Social Desirability Bias Analysis</h2>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">For Likert 1-7 scales, the midpoint is 4. Consistent skew above 4 suggests social desirability bias (LLMs giving "nice" answers). Below 4 suggests overcorrection.</p>
      <div class="chart-container" style="height:250px"><canvas id="exp-skew-chart"></canvas></div>
      <table style="margin-top:1rem">
        <thead><tr><th>Question</th><th>Mean</th><th>Skew from Midpoint</th><th>Direction</th></tr></thead>
        <tbody>${data.skewAnalysis.map(s => `
          <tr>
            <td>${s.questionId.replace(/^cp_|^fa_|^ta_/,'')}</td>
            <td>${s.mean.toFixed(2)}</td>
            <td style="color:${Math.abs(s.skew)>0.5 ? 'var(--warning)' : 'var(--text-muted)'}">${s.skew > 0 ? '+' : ''}${s.skew.toFixed(2)}</td>
            <td><span class="badge badge-${s.direction==='positive'?'warning':s.direction==='negative'?'danger':'success'}">${s.direction}</span></td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>` : ''}

    <!-- Per-Question Deep Dive -->
    <div class="card">
      <h2>Per-Question Analysis</h2>
      ${data.perQuestion.map((q, qi) => `
        <div style="border-top:1px solid var(--border);padding-top:1.5rem;margin-top:1.5rem${qi===0?';border:none;padding-top:0;margin-top:0':''}">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <h3 style="margin-bottom:0.25rem">${esc(q.question_id)}</h3>
              <p style="color:var(--text-muted);font-size:0.8125rem">${esc(q.question_text)}</p>
              <p style="font-size:0.75rem;color:var(--text-muted)">Type: ${q.question_type} &middot; n=${q.stats.n} valid &middot; ${q.rejections.reduce((s,r)=>s+r.count,0)} rejected</p>
            </div>
            ${q.stats.n > 0 ? `<div style="text-align:right">
              <div style="font-size:1.5rem;font-weight:700;color:var(--primary)">${q.stats.mean.toFixed(2)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">mean &plusmn;${q.stats.stddev.toFixed(2)}</div>
            </div>` : ''}
          </div>
          <div class="grid grid-2" style="margin-top:1rem">
            <div>
              <div class="chart-container" style="height:180px"><canvas id="exp-q-dist-${qi}"></canvas></div>
            </div>
            <div>
              <div class="chart-container" style="height:180px"><canvas id="exp-q-model-${qi}"></canvas></div>
            </div>
          </div>
          ${q.responseSamples.length > 0 ? `
            <details style="margin-top:0.75rem">
              <summary style="cursor:pointer;color:var(--text-muted);font-size:0.8125rem">Sample Responses (${q.responseSamples.length})</summary>
              <div style="margin-top:0.5rem">
                ${q.responseSamples.map(s => `
                  <div style="background:var(--bg);border:1px solid var(--border);border-radius:0.375rem;padding:0.75rem;margin-bottom:0.5rem;font-size:0.8125rem">
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.375rem">
                      <span style="color:var(--text-muted)">${modelShort(s.model_id)} &middot; ${s.age}yo ${s.gender||''} ${s.race||''} ${s.education||''} $${s.income ? Math.round(s.income/1000)+'K' : '?'}</span>
                      <span style="color:var(--primary);font-weight:600">${s.likert_value ?? s.parsed_value ?? '-'}</span>
                    </div>
                    <div style="color:var(--text)">${esc(s.raw_response)}</div>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
          ${q.followupSamples.length > 0 ? `
            <details style="margin-top:0.5rem">
              <summary style="cursor:pointer;color:var(--text-muted);font-size:0.8125rem">Follow-up "Why?" Responses (${q.followupSamples.length})</summary>
              <div style="margin-top:0.5rem">
                ${q.followupSamples.map(s => `
                  <div style="background:var(--bg);border:1px solid var(--border);border-radius:0.375rem;padding:0.75rem;margin-bottom:0.5rem;font-size:0.8125rem">
                    <span style="color:var(--text-muted)">${modelShort(s.model_id)}</span>
                    <div style="margin-top:0.25rem;color:var(--text)">${esc(s.raw_response)}</div>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
        </div>
      `).join('')}
    </div>

    <!-- Backstory Samples -->
    <div class="card">
      <h2>Backstory Samples</h2>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">Template-based first-person narratives generated from seed data. These are what the LLM is conditioned on.</p>
      ${data.backstorySamples.map(b => `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:0.375rem;padding:0.75rem;margin-bottom:0.5rem;font-size:0.8125rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.375rem">
            <span style="color:var(--text-muted)">Persona #${b.id} &middot; ${modelShort(b.model_id)}</span>
            <span style="color:var(--text-muted)">${b.age}yo ${b.gender||''} ${b.race||''} ${b.education||''} $${b.income?Math.round(b.income/1000)+'K':'?'} ${b.region||''}</span>
          </div>
          <div style="color:var(--text);font-style:italic">"${esc(b.backstory)}"</div>
        </div>
      `).join('')}
    </div>

    <!-- Export -->
    <div style="display:flex;gap:0.5rem;margin-bottom:2rem">
      <a href="/api/results/${id}/export" class="btn btn-outline">Export JSON</a>
      <a href="/api/results/${id}/export?format=csv" class="btn btn-outline">Export CSV</a>
      <button class="btn btn-outline" onclick="navigateTo('results')">Back to Results</button>
    </div>
  `;

  // ====== Render all charts ======

  // Model distribution pie
  makeChart('exp-model-dist', {
    type: 'doughnut',
    data: {
      labels: data.modelDist.map(m => m.modelName),
      datasets: [{ data: data.modelDist.map(m => m.count), backgroundColor: data.modelDist.map(m => modelColor(m.modelName)) }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } } } },
  });

  // Response length by model
  if (data.responseLengths.length > 0) {
    makeChart('exp-resp-length', {
      type: 'bar',
      data: {
        labels: data.responseLengths.map(r => r.modelName),
        datasets: [{ label: 'Avg chars', data: data.responseLengths.map(r => Math.round(r.avg_length)), backgroundColor: data.responseLengths.map(r => modelColor(r.modelName)) }],
      },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8' }, grid: { display: false } } } },
    });
  }

  // Demographics charts
  ['age','income','education','marital_status','race','gender','region'].forEach((dim, i) => {
    const d = data.demographics[dim];
    if (!d || d.length === 0) return;
    makeChart(`exp-demo-${i}`, {
      type: 'bar',
      data: {
        labels: d.map(b => b.bin),
        datasets: [{ data: d.map(b => b.count), backgroundColor: 'rgba(99,102,241,0.6)', borderColor: 'rgba(99,102,241,1)', borderWidth: 1 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, x: { ticks: { color: '#94a3b8', maxRotation: 45 }, grid: { display: false } } } },
    });
  });

  // Seed vs Synthetic comparison charts
  if (data.seedComparison) {
    ['age','income','education','marital_status','race','gender','region'].forEach((dim, i) => {
      const seed = data.seedComparison.seedDemographics[dim];
      const synth = data.demographics[dim];
      if ((!seed || seed.length === 0) && (!synth || synth.length === 0)) return;

      // Unify labels from both datasets
      const allLabels = new Set();
      (seed || []).forEach(s => allLabels.add(s.bin));
      (synth || []).forEach(s => allLabels.add(s.bin));
      const labels = [...allLabels];

      // Convert both to percentages for fair comparison
      const seedTotal = (seed || []).reduce((s, r) => s + r.count, 0);
      const synthTotal = (synth || []).reduce((s, r) => s + r.count, 0);

      const seedPcts = labels.map(l => {
        const row = (seed || []).find(s => s.bin === l);
        return row && seedTotal > 0 ? (row.count / seedTotal * 100) : 0;
      });
      const synthPcts = labels.map(l => {
        const row = (synth || []).find(s => s.bin === l);
        return row && synthTotal > 0 ? (row.count / synthTotal * 100) : 0;
      });

      makeChart(`exp-seed-vs-${i}`, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: `Real (n=${seedTotal})`,
              data: seedPcts,
              backgroundColor: 'rgba(99,102,241,0.5)',
              borderColor: 'rgba(99,102,241,1)',
              borderWidth: 1,
            },
            {
              label: `Synthetic (n=${synthTotal})`,
              data: synthPcts,
              backgroundColor: 'rgba(34,197,94,0.5)',
              borderColor: 'rgba(34,197,94,1)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`,
              },
            },
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => v + '%', color: '#94a3b8' }, grid: { color: '#334155' } },
            x: { ticks: { color: '#94a3b8', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    });
  }

  // Rejection rate by model
  {
    const models = {};
    data.modelRejections.forEach(r => {
      const name = modelShort(r.model_id);
      if (!models[name]) models[name] = { valid: 0, invalid: 0 };
      if (r.is_valid) models[name].valid += r.count;
      else models[name].invalid += r.count;
    });
    const labels = Object.keys(models);
    makeChart('exp-rejection-model', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Valid', data: labels.map(l => models[l].valid), backgroundColor: 'rgba(34,197,94,0.6)' },
          { label: 'Rejected', data: labels.map(l => models[l].invalid), backgroundColor: 'rgba(239,68,68,0.6)' },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } },
    });
  }

  // Skew chart
  if (data.skewAnalysis.length > 0) {
    makeChart('exp-skew-chart', {
      type: 'bar',
      data: {
        labels: data.skewAnalysis.map(s => s.questionId.replace(/^cp_|^fa_|^ta_/,'')),
        datasets: [{
          label: 'Mean response',
          data: data.skewAnalysis.map(s => s.mean),
          backgroundColor: data.skewAnalysis.map(s => s.direction === 'positive' ? 'rgba(245,158,11,0.6)' : s.direction === 'negative' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: { annotations: { midline: { type: 'line', yMin: 4, yMax: 4, borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], label: { content: 'Midpoint (4)', display: true, color: '#ef4444', font: { size: 10 } } } } }
        },
        scales: { y: { min: 1, max: 7, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } },
      },
    });
  }

  // Per-question charts
  data.perQuestion.forEach((q, qi) => {
    // Distribution chart
    if (q.distribution.length > 0) {
      const isLikert = q.question_type === 'likert';
      const isMC = q.question_type === 'multiple_choice';
      let labels, values;

      if (isLikert) {
        labels = ['1','2','3','4','5','6','7'];
        values = labels.map(l => {
          const d = q.distribution.find(d => d.value === parseInt(l));
          return d ? d.count : 0;
        });
      } else if (isMC) {
        const optLabels = MC_OPTIONS[q.question_id];
        labels = q.distribution.map(d => optLabels ? (optLabels[d.value - 1] || `Option ${d.value}`) : `Option ${d.value}`);
        values = q.distribution.map(d => d.count);
      } else {
        labels = q.distribution.map(d => String(d.value));
        values = q.distribution.map(d => d.count);
      }

      makeChart(`exp-q-dist-${qi}`, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Responses',
            data: values,
            backgroundColor: isLikert
              ? labels.map((_, i) => {
                  const hue = 240 - (i * 30); // blue to orange
                  return `hsla(${hue},70%,60%,0.6)`;
                })
              : 'rgba(99,102,241,0.6)',
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Response Distribution', color: '#e2e8f0', font: { size: 11 } } },
          scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }, x: { ticks: { color: '#94a3b8', maxRotation: 45, font: { size: 10 } }, grid: { display: false } } },
        },
      });
    }

    // Model comparison chart
    if (q.byModel.length > 1) {
      makeChart(`exp-q-model-${qi}`, {
        type: 'bar',
        data: {
          labels: q.byModel.map(m => m.modelName),
          datasets: [{
            label: 'Mean',
            data: q.byModel.map(m => m.mean),
            backgroundColor: q.byModel.map(m => modelColor(m.modelName)),
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Mean by Model', color: '#e2e8f0', font: { size: 11 } },
          },
          scales: {
            y: {
              min: q.question_type === 'likert' ? 1 : undefined,
              max: q.question_type === 'likert' ? 7 : undefined,
              beginAtZero: q.question_type !== 'likert',
              ticks: { color: '#94a3b8' }, grid: { color: '#334155' },
            },
            x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    }
  });
};
