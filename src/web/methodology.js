// Methodology document renderer
// Loads /api/analysis/summary and renders an investor-facing methodology explainer

window.loadMethodology = async function() {
  const el = document.getElementById('methodology-content');
  el.innerHTML = '<div style="text-align:center;padding:3rem"><div class="spinner"></div><p style="margin-top:1rem;color:var(--text-muted)">Loading methodology...</p></div>';

  let data;
  try {
    data = await api.get('/api/analysis/summary');
  } catch (err) {
    el.innerHTML = '<div class="card"><h2>Error loading methodology data</h2><p style="color:var(--danger)">' + (err.message || 'Could not fetch summary data') + '</p></div>';
    return;
  }

  const totalCost = data.totalCost;
  const costPerPersona = data.costPerPersona;
  const avgScore = data.experiments.length > 0
    ? Math.round(data.experiments.reduce((s, e) => s + e.score, 0) / data.experiments.length)
    : 0;
  const avgValidRate = data.overallValidRate;
  const totalHumanEquiv = data.experiments.reduce((s, e) => s + e.effectiveHumanEquiv, 0);

  el.innerHTML = `
    <!-- Print controls -->
    <div id="print-controls" style="display:flex;justify-content:flex-end;gap:0.5rem;margin-bottom:1rem">
      <button class="btn btn-outline btn-sm" onclick="window.print()">Print / Export PDF</button>
      <button class="btn btn-outline btn-sm" onclick="navigateTo('dashboard')">Back to Dashboard</button>
    </div>

    <!-- 1. Executive Summary -->
    <div class="card doc-section">
      <h2>1. Executive Summary</h2>
      <div class="doc-callout">
        <strong>Silicon Sampling</strong> uses large language models to generate statistically validated synthetic consumer personas from real demographic data.
        Instead of recruiting and paying real participants ($18-61/hour), we condition LLMs on actual survey records to produce
        synthetic focus groups that can be generated in hours, at 1000x lower cost, with built-in statistical validation.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">
        <div class="doc-stat"><div class="value">${data.totalPersonas}</div><div class="label">Personas Generated</div></div>
        <div class="doc-stat"><div class="value">$${totalCost.toFixed(2)}</div><div class="label">Total Cost</div></div>
        <div class="doc-stat"><div class="value">$${costPerPersona.toFixed(4)}</div><div class="label">Cost per Persona</div></div>
        <div class="doc-stat"><div class="value">${avgScore}/100</div><div class="label">Avg Validation Score</div></div>
        <div class="doc-stat"><div class="value">${(avgValidRate * 100).toFixed(1)}%</div><div class="label">Response Validity</div></div>
      </div>
      <p>This MVP generated <strong>${data.totalPersonas} synthetic personas</strong> across <strong>${data.totalExperiments} minority focus groups</strong> for a total of <strong>$${totalCost.toFixed(2)}</strong> ($${costPerPersona.toFixed(4)}/persona). Each persona was grounded in real demographic data from ${data.totalSeedRecords.toLocaleString()} government survey records, interviewed by ${data.modelUsage.length} different LLMs, and validated using chi-squared tests, KL-divergence, variance analysis, and bias detection.</p>
    </div>

    <!-- 2. The Problem -->
    <div class="card doc-section">
      <h2>2. The Problem</h2>
      <p>Minority and underrepresented consumer segments are systematically underserved by market research. Traditional focus groups cost $4,000-$12,000 per session and take 4-6 weeks to recruit. For niche demographics (Native American consumers, single mothers earning under $30K, Asian-American tech adopters), these economics make research prohibitively expensive.</p>
      <table>
        <thead><tr><th>Method</th><th>Cost per Participant</th><th>Timeline</th><th>Scalability</th></tr></thead>
        <tbody>
          <tr><td>In-person focus group</td><td>$150-300+</td><td>4-6 weeks</td><td>8-12 per session</td></tr>
          <tr><td>Online survey panel</td><td>$18-61/hour</td><td>1-2 weeks</td><td>100-1000</td></tr>
          <tr><td>Digital ethnography</td><td>$50-100</td><td>2-4 weeks</td><td>20-50</td></tr>
          <tr><td style="color:var(--primary);font-weight:600">Silicon Sampling</td><td style="color:var(--primary);font-weight:600">$${costPerPersona.toFixed(3)}</td><td style="color:var(--primary);font-weight:600">Hours</td><td style="color:var(--primary);font-weight:600">Unlimited</td></tr>
        </tbody>
      </table>
      <p style="margin-top:0.75rem">The gap is especially acute for emerging markets, rare demographics, and rapid iteration. Companies needing weekly consumer pulse-checks on minority segments simply cannot afford traditional methods.</p>
    </div>

    <!-- 3. Academic Foundation -->
    <div class="card doc-section">
      <h2>3. Academic Foundation</h2>
      <p>Silicon sampling builds on a growing body of peer-reviewed research demonstrating that LLMs can simulate human survey responses with measurable fidelity:</p>
      <div class="doc-paper">
        <div class="authors">Argyle et al. (2023) - "Out of One, Many"</div>
        <div class="finding">Foundational paper. Showed GPT-3 can reproduce U.S. public opinion surveys when conditioned on demographics. Coined "algorithmic fidelity" and "silicon sampling."</div>
      </div>
      <div class="doc-paper">
        <div class="authors">Sun et al. (2024) - "Random Silicon Sampling"</div>
        <div class="finding">Demonstrated group-level demographic conditioning without individual-level data. No need for personal records &mdash; just population distributions.</div>
      </div>
      <div class="doc-paper">
        <div class="authors">Sarstedt et al. (2024) - Marketing Research Review</div>
        <div class="finding">Comprehensive review of 285 comparisons across studies. Provided checklist for deploying silicon samples in marketing. Identified social desirability bias as #1 challenge.</div>
      </div>
      <div class="doc-paper">
        <div class="authors">Brand et al. (2023) - Harvard Business School</div>
        <div class="finding">Conjoint analysis and willingness-to-pay studies. Fine-tuning with domain data dramatically improves accuracy for specific market research tasks.</div>
      </div>
      <div class="doc-paper">
        <div class="authors">Moon et al. (2026) - Persona Deep Binding</div>
        <div class="finding">Base models outperform chat models. Narrative backstories ("deep binding") improve character consistency. First-person conditioning is critical.</div>
      </div>
      <div class="doc-paper">
        <div class="authors">Hullman et al. (2024) - Validation Framework</div>
        <div class="finding">Statistical calibration framework and bias taxonomy. Defines what "valid" means for synthetic survey data and how to measure it.</div>
      </div>
    </div>

    <!-- 4. Data Sources -->
    <div class="card doc-section">
      <h2>4. Data Sources</h2>
      <p>We seed our personas from real government and research survey data totaling <strong>${data.totalSeedRecords.toLocaleString()} records</strong>:</p>
      <table>
        <thead><tr><th>Dataset</th><th>Records</th><th>What It Provides</th></tr></thead>
        <tbody>
          ${data.datasetBreakdown.map(d => {
            const desc = d.dataset === 'bls' ? 'BLS Consumer Expenditure Survey PUMD &mdash; richest demographics (age, race, income, occupation, region) + 14 spending categories'
              : d.dataset === 'uci' ? 'UCI Adult Census Income &mdash; 48K rows, strong demographic distributions (race, occupation, income)'
              : d.dataset === 'kaggle' ? 'Kaggle Customer Personality Analysis &mdash; 2,240 customers, 27 columns, demographics + campaign response'
              : d.dataset + ' dataset';
            return '<tr><td style="font-weight:600">' + esc(d.dataset) + '</td><td>' + d.count.toLocaleString() + '</td><td style="font-size:0.8125rem;color:var(--text-muted)">' + desc + '</td></tr>';
          }).join('')}
          <tr style="font-weight:600"><td>Total</td><td>${data.totalSeedRecords.toLocaleString()}</td><td></td></tr>
        </tbody>
      </table>
      <p style="margin-top:0.75rem">Each real record provides demographics (age, gender, race, education, income, region, marital status, occupation) that form the basis for persona conditioning. No individual identifiers are used.</p>
    </div>

    <!-- 5. How It Works -->
    <div class="card doc-section">
      <h2>5. How It Works</h2>
      <p>The silicon sampling pipeline has 8 stages:</p>
      <div class="doc-pipeline">
        <div class="step">1. Seed Data</div><div class="arrow">&rarr;</div>
        <div class="step">2. Filter &amp; Sample</div><div class="arrow">&rarr;</div>
        <div class="step">3. Backstory</div><div class="arrow">&rarr;</div>
        <div class="step">4. Assign Model</div><div class="arrow">&rarr;</div>
        <div class="step">5. Interview</div><div class="arrow">&rarr;</div>
        <div class="step">6. Filter</div><div class="arrow">&rarr;</div>
        <div class="step">7. Validate</div><div class="arrow">&rarr;</div>
        <div class="step">8. Score</div>
      </div>
      <ol>
        <li><strong>Seed Data:</strong> Load real survey records from BLS/UCI/Kaggle into a unified schema.</li>
        <li><strong>Filter &amp; Sample:</strong> Apply demographic filters (race=black, income&lt;$30K, etc.) to select the target subgroup, then randomly sample N records.</li>
        <li><strong>Generate Backstory:</strong> Convert each sampled record into a first-person narrative: <em>"I'm a 34-year-old Black woman living in Atlanta. I work as a medical assistant earning $42K/year..."</em></li>
        <li><strong>Assign Model:</strong> Randomly assign each persona to one of ${data.modelUsage.length} LLMs using weighted probability. Multi-model ensembles reduce single-model bias.</li>
        <li><strong>Interview:</strong> Send each persona's backstory + each question to the assigned LLM. Parse structured responses (Likert 1-7, multiple choice, free text).</li>
        <li><strong>Consistency Filter:</strong> Reject responses where the LLM breaks character ("As an AI..."), gives off-scale answers, or refuses to engage.</li>
        <li><strong>Validate:</strong> Run chi-squared tests, KL-divergence, variance analysis, and bias detection against the original seed data.</li>
        <li><strong>Score:</strong> Compute a 0-100 composite validation score and effective human equivalent count.</li>
      </ol>
    </div>

    <!-- 6. Model Ensemble -->
    <div class="card doc-section">
      <h2>6. Model Ensemble</h2>
      <p>We use ${data.modelUsage.length} different LLMs to generate responses. Using multiple models is critical because each model has different training data, RLHF calibration, and response tendencies. A single-model approach would inherit that model's systematic biases.</p>
      <table>
        <thead><tr><th>Model</th><th>Personas</th><th>Cost</th><th>Cost/Persona</th></tr></thead>
        <tbody>
          ${data.modelUsage.map(m => '<tr><td>' + esc(m.modelName) + '</td><td>' + m.personas + '</td><td>$' + m.cost.toFixed(4) + '</td><td>$' + (m.cost / m.personas).toFixed(4) + '</td></tr>').join('')}
        </tbody>
      </table>
      <p style="margin-top:0.75rem">Models are assigned with weighted probability. Higher-weight models (lower cost) get more personas, ensuring budget efficiency while maintaining diversity. The inter-model variance actually <em>helps</em> &mdash; it mimics the natural heterogeneity found in real human populations.</p>
    </div>

    <!-- 7. Validation Framework -->
    <div class="card doc-section">
      <h2>7. Validation Framework</h2>
      <p>Every experiment is automatically validated using 4 independent methods. The combined result is a 0-100 score that quantifies how "real" the synthetic data looks.</p>

      <h3>7a. Consistency Filtering</h3>
      <p>Before any analysis, we filter out responses where the LLM broke character. This catches refusals ("I cannot answer as an AI"), off-scale responses, and nonsense outputs. Our validity rate across all experiments: <strong>${(avgValidRate * 100).toFixed(1)}%</strong>.</p>

      <h3>7b. Distributional Fit (Chi-Squared + KL-Divergence)</h3>
      <p>We compare the demographic distributions of sampled personas against the seed population using chi-squared goodness-of-fit tests (p &gt; 0.05 = pass) and KL-divergence (&lt; 0.2 = good). These tests verify that the random sampling didn't introduce systematic demographic bias.</p>

      <h3>7c. Variance Analysis</h3>
      <p>We check that synthetic responses show realistic variance &mdash; not too uniform (mode collapse / LLM consensus) and not too scattered (hallucination). Responses should approximate the spread expected from real human populations.</p>

      <h3>7d. Bias Detection</h3>
      <p>We scan for known LLM biases documented in the academic literature:</p>
      <ul>
        <li><strong>Social desirability bias:</strong> LLMs tend to give "nice" answers (brand loyalty, sustainability consciousness). This is the #1 known bias, caused by RLHF training that rewards agreeable responses.</li>
        <li><strong>Mode collapse:</strong> Multiple personas giving identical responses, reducing effective sample diversity.</li>
        <li><strong>Caricaturing:</strong> Exaggerating stereotypical traits for the demographic (e.g., assuming all low-income respondents are financially distressed).</li>
        <li><strong>Refusal patterns:</strong> Models refusing to engage with sensitive questions about money, race, or health.</li>
      </ul>

      <h3>Scoring</h3>
      <div class="doc-callout">
        <p style="margin:0"><strong>The 0-100 score</strong> starts at 100 and deducts points for: low validity rate (up to -30), distributional test failures (up to -30), poor variance (up to -20), and detected biases (-10 per high severity, -5 per medium). A score of 70+ is a <strong>PASS</strong>, 50-69 is <strong>MARGINAL</strong>, below 50 is <strong>FAIL</strong>.</p>
      </div>
      <div class="doc-callout">
        <p style="margin:0"><strong>Effective Human Equivalent</strong> estimates how many real participants this synthetic cohort "replaces": personas &times; validity rate &times; (score/100). E.g., 100 personas at 95% validity and score 72 = ~68 effective human equivalents.</p>
      </div>
    </div>

    <!-- 8. Results -->
    <div class="card doc-section">
      <h2>8. Results</h2>
      <p>We ran ${data.experiments.length} experiments targeting underrepresented consumer segments:</p>
      <table>
        <thead><tr>
          <th>Experiment</th><th>Personas</th><th>Seed Pool</th><th>Cost</th>
          <th>Valid %</th><th>Chi-sq Pass</th><th>Score</th><th>Verdict</th><th>Human Equiv</th>
        </tr></thead>
        <tbody>
          ${data.experiments.map(e => `<tr>
            <td><a href="#" onclick="loadExperiment(${e.id}); return false;">${esc(e.name)}</a></td>
            <td>${e.personaCount}</td>
            <td>${e.seedPoolSize.toLocaleString()}</td>
            <td>$${e.totalCost.toFixed(4)}</td>
            <td>${(e.validRate * 100).toFixed(1)}%</td>
            <td>${e.chiPassed}/${e.chiTotal}</td>
            <td style="font-weight:600;color:${e.score >= 70 ? 'var(--success)' : e.score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${e.score}</td>
            <td><span class="badge badge-${e.verdict === 'pass' ? 'success' : e.verdict === 'marginal' ? 'warning' : 'danger'}">${e.verdict.toUpperCase()}</span></td>
            <td>~${e.effectiveHumanEquiv}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr style="font-weight:600">
          <td>Totals</td>
          <td>${data.totalPersonas}</td>
          <td>${data.totalSeedRecords.toLocaleString()}</td>
          <td>$${totalCost.toFixed(2)}</td>
          <td>${(avgValidRate * 100).toFixed(1)}%</td>
          <td></td>
          <td>${avgScore}</td>
          <td></td>
          <td>~${totalHumanEquiv}</td>
        </tr></tfoot>
      </table>
    </div>

    <!-- 9. Key Findings -->
    <div class="card doc-section">
      <h2>9. Key Findings</h2>
      <div class="doc-callout warning">
        <strong>Social desirability is the #1 bias.</strong> Across all experiments, Likert-scale responses consistently skew above the midpoint. LLMs trained with RLHF give "socially desirable" answers &mdash; higher brand loyalty, more sustainability consciousness, more optimistic financial outlook than real data suggests. This is well-documented in the literature (Sarstedt et al., 2024).
      </div>
      <div class="doc-callout success">
        <strong>Multi-model ensembles provide realistic diversity.</strong> Different LLMs produce measurably different response distributions. This inter-model variance mimics the natural heterogeneity of real human populations and is a feature, not a bug.
      </div>
      <div class="doc-callout warning">
        <strong>Small seed pools hurt distributional fit.</strong> Experiments filtering for rare demographics (e.g., Native American) had smaller seed pools, leading to chi-squared failures. This is expected: a random sample of 100 from a small pool will have higher sampling noise.
      </div>
      <div class="doc-callout">
        <strong>Chi-squared failures at n=100 are expected.</strong> Even a real random sample of 100 from a population often fails chi-squared goodness-of-fit tests. These failures indicate sampling variance, not necessarily LLM bias. Increasing persona count to 500+ would improve distributional match.
      </div>
      <div class="doc-callout success">
        <strong>High consistency rate (${(avgValidRate * 100).toFixed(1)}%).</strong> Across ${data.totalResponses.toLocaleString()} total responses, only ${((1 - avgValidRate) * 100).toFixed(1)}% were filtered out for breaking character, refusing, or giving off-scale answers. The LLMs stay in persona well when given detailed backstories.
      </div>
    </div>

    <!-- 10. Limitations & Mitigations -->
    <div class="card doc-section">
      <h2>10. Limitations & Mitigations</h2>
      <table>
        <thead><tr><th>Limitation</th><th>Impact</th><th>Mitigation</th></tr></thead>
        <tbody>
          <tr>
            <td>Social desirability bias</td>
            <td style="color:var(--warning)">High</td>
            <td>Post-hoc calibration against known benchmarks; use base models instead of RLHF-tuned; lower temperature</td>
          </tr>
          <tr>
            <td>LLMs don't have lived experience</td>
            <td style="color:var(--warning)">Medium</td>
            <td>Validate against ground-truth survey data; use for directional insights, not point estimates</td>
          </tr>
          <tr>
            <td>Training data recency</td>
            <td style="color:var(--text-muted)">Low</td>
            <td>Use recent seed data; update models as new ones are released</td>
          </tr>
          <tr>
            <td>Mode collapse</td>
            <td style="color:var(--text-muted)">Low</td>
            <td>Multi-model ensemble, temperature=1.0, variance monitoring</td>
          </tr>
          <tr>
            <td>Refusals on sensitive topics</td>
            <td style="color:var(--text-muted)">Low</td>
            <td>Consistency filtering catches and quantifies these; model selection (some models refuse less)</td>
          </tr>
          <tr>
            <td>Not a replacement for real research</td>
            <td style="color:var(--warning)">Critical</td>
            <td>Silicon samples complement, not replace. Best for rapid hypothesis generation, early-stage screening, and underserved segments where real data doesn't exist</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 11. Value Proposition -->
    <div class="card doc-section">
      <h2>11. Value Proposition</h2>
      <div style="display:flex;flex-wrap:wrap;gap:1rem;margin:1rem 0">
        <div class="doc-callout" style="flex:1;min-width:200px">
          <strong>1000x Cost Reduction</strong><br>
          $${costPerPersona.toFixed(3)}/persona vs $18-61/hour for real participants.
          This MVP's ${data.totalPersonas} personas cost $${totalCost.toFixed(2)}.
          Equivalent real focus groups: ~$${(data.totalPersonas * 40).toLocaleString()}.
        </div>
        <div class="doc-callout" style="flex:1;min-width:200px">
          <strong>Hours, Not Weeks</strong><br>
          Traditional recruiting takes 4-6 weeks. Silicon samples generate in hours.
          Iterate on questions, demographics, and sample sizes in real-time.
        </div>
        <div class="doc-callout" style="flex:1;min-width:200px">
          <strong>Any Demographic, Any Scale</strong><br>
          ${data.totalSeedRecords.toLocaleString()} seed records cover rare demographics that traditional panels can't reach.
          Scale from 50 to 5,000 personas with linear cost.
        </div>
        <div class="doc-callout" style="flex:1;min-width:200px">
          <strong>Built-in Validation</strong><br>
          Every cohort is automatically scored. Chi-squared, KL-divergence, variance analysis, and bias detection &mdash; no statistician required.
        </div>
      </div>
    </div>

    <!-- 12. Print/Export -->
    <div id="print-controls" style="display:flex;justify-content:center;gap:0.5rem;margin-bottom:2rem">
      <button class="btn btn-primary" onclick="window.print()">Print / Export PDF</button>
      <button class="btn btn-outline" onclick="navigateTo('dashboard')">Back to Dashboard</button>
    </div>
  `;
};
