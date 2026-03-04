// Home — Story-driven landing page

window.loadHome = async function() {
  const el = document.getElementById('home-content');
  el.innerHTML = '<div style="text-align:center;padding:3rem"><div class="spinner"></div></div>';

  let data;
  try {
    data = await api.get('/api/analysis/summary');
  } catch (err) {
    data = null;
  }

  const totalExperiments = data?.totalExperiments || 0;
  const totalPersonas = data?.totalPersonas || 0;
  const totalCost = data?.totalCost || 0;
  const avgScore = data?.experiments?.length > 0
    ? Math.round(data.experiments.reduce((s, e) => s + e.score, 0) / data.experiments.length)
    : 0;
  // Estimate human equivalent cost: ~$150 per participant for traditional focus groups
  const humanEquivCost = totalPersonas * 150;

  el.innerHTML = `
    <!-- Hero -->
    <div class="hero">
      <h2 class="hero-title"><span style="color:var(--primary)">Si</span>licon Samples</h2>
      <p class="hero-subtitle">LLM-powered synthetic consumer panels for underrepresented markets</p>
      <p class="hero-desc">Generate statistically validated synthetic personas from real demographic data, then interview them at scale — in hours, not weeks, at a fraction of the cost.</p>
    </div>

    <!-- Problem Statement -->
    <div class="card doc-section">
      <h2>The Problem</h2>
      <p>Traditional focus groups cost $5,000-$15,000 per session and take weeks to recruit. For minority and emerging market segments — Black consumers, Asian Americans, Native communities, low-income households — the problem is worse: smaller sampling pools, higher recruitment costs, and persistent underrepresentation in commercial research panels.</p>
      <p>The result: brands make billion-dollar decisions about underrepresented markets based on small, biased samples — or no primary research at all.</p>
    </div>

    <!-- Approach -->
    <div class="card doc-section">
      <h2>Our Approach</h2>
      <p>Silicon Sampling uses large language models conditioned on real demographic data to generate synthetic consumer personas that respond to survey questions with statistically validated fidelity.</p>
      <div class="approach-flow">
        <div class="approach-card">
          <div class="approach-icon">1</div>
          <h3>Real Seed Data</h3>
          <p>BLS Consumer Expenditure, UCI Census, and Kaggle marketing datasets provide demographic ground truth — ${data?.totalSeedRecords?.toLocaleString() || '57,000+'} real consumer records.</p>
        </div>
        <div class="approach-card">
          <div class="approach-icon">2</div>
          <h3>LLM Persona Generation</h3>
          <p>Each persona is conditioned on a real demographic profile and given a narrative backstory. An ensemble of ${data?.modelUsage?.length || 8}+ diverse models (Western + Chinese) reduces individual model bias.</p>
        </div>
        <div class="approach-card">
          <div class="approach-icon">3</div>
          <h3>Statistical Validation</h3>
          <p>Chi-squared tests, KL-divergence, social desirability detection, and consistency filtering ensure synthetic responses match real population distributions.</p>
        </div>
      </div>
    </div>

    <!-- Key Stats -->
    ${data ? `
    <div class="grid grid-4">
      <div class="card stat-card">
        <div class="value">${totalExperiments}</div>
        <div class="label">Experiments Run</div>
      </div>
      <div class="card stat-card">
        <div class="value">${totalPersonas.toLocaleString()}</div>
        <div class="label">Personas Generated</div>
      </div>
      <div class="card stat-card">
        <div class="value">$${totalCost.toFixed(2)}</div>
        <div class="label">Total Cost<br><span style="font-size:0.7rem;color:var(--text-muted)">vs ~$${(humanEquivCost/1000).toFixed(0)}K human equiv.</span></div>
      </div>
      <div class="card stat-card">
        <div class="value">${avgScore}/100</div>
        <div class="label">Avg Validation Score</div>
      </div>
    </div>
    ` : ''}

    <!-- CTAs -->
    <div style="display:flex;gap:1rem;justify-content:center;margin:2rem 0 3rem">
      <button class="btn btn-primary" onclick="navigateTo('results')">View Results</button>
      <button class="btn btn-outline" onclick="navigateTo('methodology')">Read Methodology</button>
    </div>
  `;
};
