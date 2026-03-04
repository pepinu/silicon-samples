// Results Page — Narrated experiment cards

const NARRATIVES = {
  1: {
    title: 'Black Consumers (n=100)',
    story: 'Initial small-scale test targeting Black American consumers using 5 models. Passed validity but chi-squared tests failed across all demographic dimensions — sample too small for distributional match.',
    hypothesis: 'Can LLMs conditioned on real BLS/UCI data produce demographically representative Black consumer personas?',
    finding: 'High validity rate (93%) but distributional tests require larger sample sizes. Led to scaling up to n=500 in experiment 9.',
  },
  2: {
    title: 'Asian Consumers (n=100)',
    story: 'Parallel test for Asian American consumers. Stronger chi-squared results (2/4 passed) than the Black consumer cohort, possibly due to tighter demographic clustering in seed data.',
    hypothesis: 'Does seed pool size (2,627 Asian records vs 5,641 Black records) affect persona fidelity?',
    finding: 'Smaller seed pool paradoxically produced better distributional match. Score: 85/100.',
  },
  3: {
    title: 'Single Mothers',
    story: 'First intersectional filter test — female, single/divorced, with children. Tests whether multi-attribute demographic conditioning holds up.',
    hypothesis: 'Can LLMs maintain persona fidelity when conditioned on multiple overlapping demographic constraints?',
    finding: 'Validity held at 93% but chi-squared failed across all dimensions. Intersectional conditioning is harder.',
  },
  4: {
    title: 'Low-Income Households',
    story: 'Economic segment test: households under $25K income. Critical for understanding LLM bias toward middle-class assumptions.',
    hypothesis: 'Do LLMs exhibit income-related bias when role-playing as low-income consumers?',
    finding: 'Chi-squared failed on all 8 dimensions — LLMs struggle with economic extremes. Confirms known "blue-shift" bias toward affluent personas.',
  },
  5: {
    title: 'Native American & Pacific Islander',
    story: 'Smallest seed pool test (597 records). Pushed the limits of silicon sampling for truly underrepresented populations.',
    hypothesis: 'Is silicon sampling viable when the seed data pool is extremely small?',
    finding: 'Only 1/4 chi-squared passed. Validates Verasight\'s finding: subgroup MAE >10 points for minority demographics.',
  },
  7: {
    title: 'General Population v1 (n=500)',
    story: 'First large-scale run with 5 models across the full population. Established baseline performance at scale with all three seed datasets merged.',
    hypothesis: 'Does scaling to 500 personas with merged seed data (BLS+UCI+Kaggle) improve distributional match?',
    finding: 'Strong results: 3/4 chi-squared passed, 99.4% validity rate. Score: 93/100. Proves the methodology works at scale for general population.',
  },
  8: {
    title: 'General Population v2 (n=500)',
    story: 'Expanded to 8-model ensemble including Chinese models (DeepSeek, Qwen, Seed, GLM) plus Western models. Added reverse-coded social desirability questions and third-person prompt framing per Chapala et al.',
    hypothesis: 'Adding Chinese models and honesty priming reduces social desirability bias.',
    finding: 'All 4 chi-squared passed. SD bias persists across all models regardless of origin, but multi-model ensemble averages it out. Score: 97/100.',
  },
  10: {
    title: 'General Population v3 (n=500)',
    story: 'Latest model roster with Gemini 3 Flash, Grok 3 Mini, MiniMax M2.5, and Xiaomi MiMo V2. Updated question set with third-person reformulation across all items.',
    hypothesis: 'Do next-gen models (2026 releases) improve persona fidelity?',
    finding: 'All 4 chi-squared passed with lower validity rate (86%) — newer models are more creative but less constrained. Score: 96/100.',
  },
  11: {
    title: 'Black American Consumers v2 (n=500)',
    story: 'Scaled-up rerun of experiment 1 with 8-model ensemble and all methodology improvements. Tests whether the fixes developed on general population transfer to minority segments.',
    hypothesis: 'Does the improved methodology (8 models, third-person framing, larger n) fix the Black consumer chi-squared failures from experiment 1?',
    finding: 'All 4 chi-squared passed, up from 0/4 in experiment 1. Score: 100/100. Proves minority segments work at sufficient scale with the right methodology.',
  },
  12: {
    title: 'Asian American Consumers v2 (n=500)',
    story: 'Companion to experiment 11 — scaled-up Asian consumer study. Included Chinese-origin models for potentially better cultural fidelity.',
    hypothesis: 'Do Chinese-language models improve Asian American persona fidelity?',
    finding: 'All 4 chi-squared passed, 97% validity. Score: 100/100. Chinese models did not show significant advantage over Western models for English-language surveys of Asian Americans.',
  },
};

function scoreColor(score) {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'danger';
}

window.loadResults = async function() {
  const el = document.getElementById('results-content');
  el.innerHTML = '<div style="text-align:center;padding:3rem"><div class="spinner"></div><p style="margin-top:1rem;color:var(--text-muted)">Loading results...</p></div>';

  let data;
  try {
    data = await api.get('/api/analysis/summary');
  } catch (err) {
    el.innerHTML = '<div class="card"><h2>Error loading results</h2><p style="color:var(--danger)">' + (err.message || 'Could not fetch summary data') + '</p></div>';
    return;
  }

  const experiments = data.experiments || [];
  const bestScore = experiments.length > 0 ? Math.max(...experiments.map(e => e.score)) : 0;
  const avgScore = experiments.length > 0 ? Math.round(experiments.reduce((s, e) => s + e.score, 0) / experiments.length) : 0;

  el.innerHTML = `
    <!-- Summary Header -->
    <div class="card doc-section">
      <h2>Experiment Results</h2>
      <p>From initial small-scale calibration tests (experiments 1-5, n=100 each) through methodology refinement (experiments 6-8, general population at n=500) to validated minority market studies (experiments 9-10, n=500 with 8-model ensemble) — each experiment built on the findings of the last.</p>
      <div class="grid grid-4" style="margin-top:1rem">
        <div class="stat-card">
          <div class="value">${experiments.length}</div>
          <div class="label">Experiments</div>
        </div>
        <div class="stat-card">
          <div class="value">${bestScore}/100</div>
          <div class="label">Best Score</div>
        </div>
        <div class="stat-card">
          <div class="value">${avgScore}/100</div>
          <div class="label">Average Score</div>
        </div>
        <div class="stat-card">
          <div class="value">$${data.totalCost?.toFixed(2) || '0'}</div>
          <div class="label">Total Cost</div>
        </div>
      </div>
    </div>

    <!-- Experiment Cards -->
    <div id="result-cards">
      ${experiments.map(exp => renderResultCard(exp)).join('')}
    </div>
  `;

  // Attach expand/collapse handlers
  el.querySelectorAll('.result-card-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.result-card');
      const detail = card.querySelector('.result-card-detail');
      const isExpanded = card.classList.contains('expanded');
      card.classList.toggle('expanded');
      detail.style.display = isExpanded ? 'none' : '';
      btn.textContent = isExpanded ? 'View Details' : 'Hide Details';
    });
  });
};

function renderResultCard(exp) {
  const narrative = NARRATIVES[exp.id] || {};
  const title = narrative.title || exp.name;
  const story = narrative.story || '';
  const chiLabel = exp.chiTotal > 0 ? `${exp.chiPassed}/${exp.chiTotal} passed` : 'N/A';

  return `
    <div class="result-card">
      <div class="result-card-header">
        <div class="result-card-title-row">
          <h3>${esc(exp.name)}</h3>
          <span class="score-badge score-${scoreColor(exp.score)}">${exp.score}</span>
        </div>
        ${story ? `<p class="result-card-narrative">${story}</p>` : ''}
        <div class="result-card-metrics">
          <span class="metric-pill"><strong>${exp.personaCount}</strong> personas</span>
          <span class="metric-pill">Chi-sq: <strong>${chiLabel}</strong></span>
          <span class="metric-pill">Valid: <strong>${(exp.validRate * 100).toFixed(0)}%</strong></span>
          <span class="metric-pill">Cost: <strong>$${exp.totalCost.toFixed(2)}</strong></span>
          <span class="metric-pill">Seed pool: <strong>${exp.seedPoolSize.toLocaleString()}</strong></span>
        </div>
      </div>

      <div class="result-card-actions">
        <button class="btn btn-sm btn-outline result-card-toggle">View Details</button>
        <button class="btn btn-sm btn-primary" onclick="loadExperiment(${exp.id})">Full Analysis</button>
      </div>

      <div class="result-card-detail" style="display:none">
        ${narrative.hypothesis ? `
        <div class="result-detail-row">
          <strong>Hypothesis:</strong> ${narrative.hypothesis}
        </div>` : ''}
        ${narrative.finding ? `
        <div class="result-detail-row">
          <strong>Finding:</strong> ${narrative.finding}
        </div>` : ''}
        <div class="result-detail-row">
          <strong>Models:</strong> ${exp.models.map(m => m.split('/')[1] || m).join(', ')}
        </div>
        <div class="result-detail-row">
          <strong>Filter:</strong> <code>${JSON.stringify(exp.filter || {})}</code>
        </div>
        <div class="result-detail-row">
          <strong>Effective human equivalent:</strong> ~${exp.effectiveHumanEquiv} participants
        </div>
      </div>
    </div>
  `;
}
