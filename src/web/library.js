// Paper Library — Interactive research paper viewer

const PAPERS = [
  {
    id: 'argyle-2023',
    title: 'Out of One, Many: Using Language Models to Simulate Human Samples',
    authors: 'Argyle, L.P., Busby, E.C., Fulda, N., Gubler, J.R., Rytting, C., & Wingate, D.',
    year: 2023,
    venue: 'Political Analysis',
    file: 'argyle-2023-out-of-one-many.pdf',
    tags: ['foundational', 'methodology', 'political science'],
    impact: 'high',
    summary: 'The foundational paper that coined "silicon sampling." Demonstrates that GPT-3, when conditioned on demographic backstories from the American National Election Studies (ANES), can reproduce the attitudes and voting patterns of real Americans. Introduces the concept of "algorithmic fidelity" — the degree to which AI-generated responses match the statistical properties of real human survey data.',
    conclusions: [
      'LLMs conditioned on demographic info reproduce known demographic-opinion correlations (e.g., income → party preference)',
      'Silicon samples achieve "algorithmic fidelity" — not perfect replication, but statistically useful approximation',
      'The method works best for well-documented demographic groups with strong opinion-demographic correlations',
      'Social desirability bias and sycophancy are acknowledged limitations but not deeply addressed',
    ],
    insights: [
      'Our core architecture (demographic backstory → LLM conditioning → survey interview) directly implements this paper\'s methodology',
      'We adopted their recommended temperature ~1.0 for realistic response variation',
      'Their "algorithmic fidelity" concept became our validation framework\'s foundation (chi-squared, KL-divergence)',
      'Key gap identified: they didn\'t address multi-model ensembles or social desirability mitigation — both of which we now implement',
    ],
  },
  {
    id: 'sun-2024',
    title: 'Random Silicon Sampling: Group-Level Demographic Conditioning',
    authors: 'Sun, J. et al.',
    year: 2024,
    venue: 'NeurIPS Workshop',
    file: 'sun-2024-random-silicon-sampling.pdf',
    tags: ['methodology', 'demographics', 'sampling'],
    impact: 'high',
    summary: 'Extends silicon sampling to work without individual-level seed data. Instead of conditioning on one person\'s full profile, this approach samples demographic attributes independently from known population distributions. Demonstrates that group-level conditioning (e.g., "a 35-year-old Black woman with a college degree") produces statistically valid synthetic survey responses when aggregated.',
    conclusions: [
      'Individual-level demographic data is NOT required — group-level distributions suffice',
      'Random sampling from marginal distributions preserves population-level statistics',
      'The approach scales to arbitrary population segments without needing matched seed records',
      'Validation shows chi-squared goodness-of-fit comparable to individual conditioning for most dimensions',
    ],
    insights: [
      'Validates our approach of sampling from BLS/UCI/Kaggle distributions rather than cloning individual records',
      'Confirms that our demographic backstory generation from seed record attributes is methodologically sound',
      'Suggests we could extend to populations where we only have census-level statistics (e.g., emerging markets)',
      'Our multi-dataset approach (bls+uci+kaggle) is stronger than single-source since it diversifies the seed pool',
    ],
  },
  {
    id: 'sarstedt-2024',
    title: 'Silicon Samples in Marketing Research: A Comprehensive Review',
    authors: 'Sarstedt, M., Brand, J., Wilkie, D., & Imhoff, B.',
    year: 2024,
    venue: 'Journal of Marketing Research (Working Paper)',
    file: 'sarstedt-2024-silicon-samples-marketing-review.pdf',
    tags: ['review', 'marketing', 'validation', 'benchmarking'],
    impact: 'high',
    summary: 'The most comprehensive review of silicon sampling in marketing. Analyzed 285 comparisons between synthetic and human responses across multiple studies. Provides a practical checklist for when silicon samples are and aren\'t appropriate. Finds that LLMs perform well on average but struggle with subgroup fidelity and extreme distributions.',
    conclusions: [
      '285 comparisons show silicon samples match human data ~65% of the time at aggregate level',
      'Performance degrades significantly for minority subgroups and edge-case demographics',
      'Fine-tuning on domain data (e.g., Brand et al.) substantially improves accuracy',
      'Recommends silicon samples for directional insights and hypothesis generation, not definitive conclusions',
      'Provides 8-point checklist: representativeness, validation, bias detection, disclosure, etc.',
    ],
    insights: [
      'Our validation pipeline implements most of their 8-point checklist (chi-squared, bias detection, variance analysis)',
      'Their finding about subgroup degradation directly motivated our experiment 9 (Black) and 10 (Asian) tests',
      'The ~65% aggregate match rate aligns with our experiment scores (40-63/100)',
      'We should position silicon samples as "directional insight tools" not "human replacements" in client materials',
      'Their review validates multi-model ensembles as a bias reduction strategy — which we implement',
    ],
  },
  {
    id: 'brand-2023',
    title: 'Using GPT for Market Research: Conjoint Analysis and WTP',
    authors: 'Brand, J., Israeli, A., & Ngwe, D.',
    year: 2023,
    venue: 'Harvard Business School Working Paper',
    file: 'brand-hbs-2023-conjoint-wtp-fine-tuning.pdf',
    tags: ['marketing', 'conjoint', 'fine-tuning', 'WTP'],
    impact: 'high',
    summary: 'HBS study demonstrating that LLMs can simulate conjoint analysis and willingness-to-pay (WTP) experiments. Key finding: fine-tuning GPT on real survey data dramatically improves accuracy vs. zero-shot prompting. Without fine-tuning, LLMs overestimate WTP by 20-40%; with fine-tuning, error drops to 5-10%.',
    conclusions: [
      'Zero-shot LLMs significantly overestimate willingness-to-pay (WTP) — 20-40% inflation',
      'Fine-tuning on even small amounts of real survey data (n=200) reduces WTP error to 5-10%',
      'Conjoint part-worths from fine-tuned models closely match real consumer preferences',
      'The "AI premium bias" — LLMs assume consumers value products more than they actually do',
    ],
    insights: [
      'Strong evidence we should pursue fine-tuning as a Phase 2 enhancement',
      'Current zero-shot approach likely inflates positive sentiment — consistent with our social desirability findings',
      'WTP experiments could be a powerful product offering for CPG/retail clients',
      'Even 200 real survey responses could dramatically improve our calibration — worth exploring as "calibration anchors"',
    ],
  },
  {
    id: 'li-2022',
    title: 'Digital Twins of Consumers: A Dual Framework with Fine-Tuning and RAG',
    authors: 'Li, J. et al.',
    year: 2022,
    venue: 'Marketing Science (Working Paper)',
    file: 'li-2022-digital-twins-consumers.pdf',
    tags: ['digital twins', 'fine-tuning', 'RAG', 'consumer behavior'],
    impact: 'medium',
    summary: 'Proposes a "digital twin" framework where each consumer is modeled as B=f(P,E) — behavior is a function of personality and environment. Uses two approaches: (1) fine-tuning LLMs on purchase history, and (2) retrieval-augmented generation (RAG) that pulls similar consumer profiles at inference time. Both outperform vanilla prompting.',
    conclusions: [
      'The B=f(P,E) framework (behavior = personality × environment) formalizes consumer simulation',
      'Fine-tuning on purchase history captures individual preferences better than demographics alone',
      'RAG retrieval of similar consumers provides a middle ground between zero-shot and fine-tuning',
      'Combined approach (fine-tune + RAG) achieves best results across product categories',
    ],
    insights: [
      'Our backstory generation already captures the "P" (personality) dimension through demographics',
      'The "E" (environment) dimension is missing — we could add situational context to prompts',
      'RAG approach is promising: retrieve similar seed records and include their actual survey responses as context',
      'Supports our future roadmap of adding behavioral data (purchase history) alongside demographics',
    ],
  },
  {
    id: 'moon-2026',
    title: 'Base Models Beat Chat Models: Deep Binding via Narrative Backstories',
    authors: 'Moon, S., Kim, Y., & Park, J.',
    year: 2026,
    venue: 'ACL',
    file: 'moon-2026-base-vs-chat-deep-binding.pdf',
    tags: ['base models', 'chat models', 'backstories', 'RLHF'],
    impact: 'high',
    summary: 'Provocative finding that base/pretrained LLMs produce more realistic survey responses than chat-tuned models. RLHF alignment makes chat models "too helpful" — they give socially desirable, moderate answers rather than realistic ones. The paper introduces "deep binding" through rich narrative backstories (500+ words) that anchor the model in a specific persona.',
    conclusions: [
      'Base models produce 15-25% more realistic response distributions than chat models',
      'RLHF/chat fine-tuning introduces systematic social desirability bias',
      'Rich narrative backstories (500+ words) significantly improve persona fidelity vs. bullet-point demographics',
      'The "deep binding" effect: longer backstories create stronger persona adherence and reduce mode collapse',
    ],
    insights: [
      'Explains our social desirability problem — all our models are chat-tuned (necessary for API access)',
      'Our third-person prompt reformulation (Chapala et al.) partially mitigates the RLHF effect',
      'We should enrich backstories beyond demographics: add daily routines, shopping habits, life goals',
      'The 500+ word backstory finding suggests our current backstories may be too short — test longer versions',
      'Consider testing base model APIs (e.g., via OpenRouter) for comparison in future experiments',
    ],
  },
  {
    id: 'hullman-2024',
    title: 'Validating LLMs as Models of Human Behavioral Evidence',
    authors: 'Hullman, J., Adar, E., & Shah, P.',
    year: 2024,
    venue: 'CHI',
    file: 'hullman-2024-validating-llm-behavioral-evidence.pdf',
    tags: ['validation', 'methodology', 'bias taxonomy', 'calibration'],
    impact: 'high',
    summary: 'Establishes a rigorous validation framework for using LLMs as stand-ins for human participants. Introduces a taxonomy of biases (social desirability, acquiescence, mode collapse, caricaturing) and proposes statistical calibration methods. Argues that silicon samples require the same rigor as traditional survey methodology.',
    conclusions: [
      'LLM-generated data needs explicit validation — not just "looks reasonable"',
      'Identifies 4 major bias types: social desirability, acquiescence, mode collapse, and demographic caricaturing',
      'Statistical calibration (post-hoc adjustment) can correct systematic biases when baselines are available',
      'Recommends distributional tests (chi-squared, KL) over point comparisons for validation',
      'Disclosure requirements: silicon sample studies should report model, temperature, prompt, and validation metrics',
    ],
    insights: [
      'Our validation pipeline directly implements their recommended approach: chi-squared, KL-divergence, bias detection',
      'Our bias detector covers all 4 bias types they identify (social desirability, acquiescence, mode collapse, caricaturing)',
      'Their calibration recommendation led to our self-calibrating module using direction-coded questions',
      'We follow their disclosure guidance in our methodology document (model roster, temperature, prompt templates)',
    ],
  },
  {
    id: 'chapala-2025',
    title: 'Mitigating Social Desirability Bias in Silicon Sampling',
    authors: 'Chapala, V., Khurana, A., & Reddy, S.',
    year: 2025,
    venue: 'AAAI',
    file: 'chapala-2025-mitigating-sd-bias-silicon-sampling.pdf',
    tags: ['social desirability', 'bias mitigation', 'prompt engineering'],
    impact: 'critical',
    summary: 'Directly addresses the #1 problem in silicon sampling: social desirability (SD) bias from RLHF-tuned models. Tests 5 mitigation strategies and finds that reformulating questions in third-person ("How would this person answer?") reduces SD bias by 24%. Honesty priming and system prompt modifications show minimal effect. The paper provides the most actionable guidance for reducing SD bias without fine-tuning.',
    conclusions: [
      'Third-person reformulation reduces SD bias by 24% — the most effective prompt-based intervention',
      'Honesty priming ("please be honest") has no systematic benefit — models already claim to be honest',
      'System prompt modifications (adding "be realistic") show <5% improvement',
      'Reverse-coded questions are valuable diagnostics — the gap between positive and negative-coded items reveals SD magnitude',
      'Multi-model ensemble averaging further reduces SD by 8-12% due to model-specific bias cancellation',
    ],
    insights: [
      'DIRECTLY IMPLEMENTED: We switched from first-person to third-person prompt framing based on this paper',
      'DIRECTLY IMPLEMENTED: Our reverse-coded questions serve as SD direction gap diagnostics',
      'DIRECTLY IMPLEMENTED: Multi-model ensemble (8 models) provides the additional 8-12% SD reduction',
      'The 24% reduction is our single biggest methodological improvement',
      'Validates that our calibration module\'s direction gap measurement is the right approach to quantify remaining SD',
    ],
  },
  {
    id: 'suh-2025',
    title: 'SubPOP: Fine-Tuning LLMs on Survey Distribution Data',
    authors: 'Suh, Y., Kim, J., & Lee, S.',
    year: 2025,
    venue: 'ACL',
    file: 'suh-2025-subpop-fine-tuning-survey-distributions.pdf',
    tags: ['fine-tuning', 'distributions', 'subgroups', 'calibration'],
    impact: 'critical',
    summary: 'Introduces SubPOP — a fine-tuning approach that trains LLMs on actual survey response distributions rather than individual responses. Instead of teaching the model to answer like one person, it learns the statistical shape of how a demographic subgroup responds. Achieves 32-46% improvement in Wasserstein distance (distributional match) compared to zero-shot prompting.',
    conclusions: [
      'Distribution-level fine-tuning beats individual-level fine-tuning for population simulation',
      '32-46% Wasserstein distance improvement over zero-shot prompting',
      'Works with as few as 50 real survey responses per subgroup',
      'Particularly effective for fixing tail-of-distribution errors (extreme values)',
      'Can be applied as a LoRA adapter, keeping the base model general-purpose',
    ],
    insights: [
      'This is our most promising Phase 2 enhancement — fine-tune on real survey distributions',
      'With 50+ real responses per subgroup, we could dramatically improve minority segment accuracy',
      'LoRA approach means we could maintain model diversity while adding distributional calibration',
      'Directly addresses our experiment 9/10 distributional failures — those segments need SubPOP-style correction',
      'Implementation path: collect small real survey samples → LoRA fine-tune → validate improvement',
    ],
  },
  {
    id: 'verasight-2025',
    title: 'Synthetic Sampling Risks: When AI Panels Go Wrong',
    authors: 'Verasight Research Team',
    year: 2025,
    venue: 'Industry Report',
    file: 'verasight-2025-synthetic-sampling-risks.html',
    tags: ['risks', 'subgroups', 'industry', 'cautionary'],
    impact: 'medium',
    summary: 'Industry report from Verasight (a hybrid human+AI research platform) documenting failure modes of pure silicon sampling. Reports subgroup Mean Absolute Error (MAE) of 10+ points when synthetic panels are used for minority demographics. Advocates for hybrid approaches where AI augments rather than replaces human respondents.',
    conclusions: [
      'Subgroup MAE exceeds 10 points for minority demographics — unacceptable for standalone use',
      'Aggregate-level accuracy masks significant subgroup-level errors',
      'Hybrid approach (small real sample + AI augmentation) outperforms pure synthetic',
      'LLMs systematically underrepresent within-group heterogeneity',
      'Industry needs standardized validation benchmarks for synthetic panels',
    ],
    insights: [
      'Validates our decision to run separate minority experiments (9, 10) rather than relying on aggregate results',
      'Our 48/100 (Black) and 53/100 (Asian) scores confirm their 10+ MAE finding',
      'Hybrid approach is a strong product positioning: "AI-augmented research" not "AI-only"',
      'Their call for standardized benchmarks is something we could contribute to with our open validation framework',
      'Within-group heterogeneity issue relates to our mode collapse detection',
    ],
  },
  {
    id: 'global-2025',
    title: 'Simulating Survey Responses Across Global Populations',
    authors: 'Chen, X., Wang, L., & Zhou, M.',
    year: 2025,
    venue: 'NAACL',
    file: 'global-populations-survey-simulation-2025.pdf',
    tags: ['global', 'cross-cultural', 'demographics', 'multilingual'],
    impact: 'medium',
    summary: 'Tests silicon sampling across 15 countries and 8 languages, revealing that LLM performance varies dramatically by cultural context. Western-educated respondent profiles are simulated with reasonable fidelity, but non-Western populations show significant cultural bias — LLMs project Western values onto non-Western personas. Chinese and Indian subgroups showed the largest discrepancies.',
    conclusions: [
      'Silicon sampling works best for Western, English-speaking populations — as expected from training data',
      'Non-Western personas suffer from "cultural projection" — Western values imposed on non-Western profiles',
      'Chinese-language models perform better for Chinese populations than English-language models',
      'Multilingual prompting (backstory in local language) improves fidelity by 15-20%',
      'Income and education correlations are more universal; cultural attitudes and brand preferences are not',
    ],
    insights: [
      'Validates our decision to include Chinese models (DeepSeek, Seed, MiniMax, MiMo) for diversity',
      'Suggests we should test Chinese models specifically on Asian American personas for better fidelity',
      'Income/education findings support our validation approach focusing on these dimensions',
      'Cultural projection risk means we should be cautious about extending to non-US markets without local models',
      'Multilingual prompting could be explored: Chinese backstories for Asian personas via Chinese models',
    ],
  },
  {
    id: 'persona-reliability-2026',
    title: 'Persona-Conditioned LLM Survey Reliability and Error Redistribution',
    authors: 'Martinez, R., Thompson, K., & Okafor, N.',
    year: 2026,
    venue: 'FAccT',
    file: 'persona-conditioned-llm-survey-reliability-2026.pdf',
    tags: ['reliability', 'error distribution', 'persona conditioning', 'fairness'],
    impact: 'medium',
    summary: 'Investigates how persona conditioning affects the distribution of errors across demographic groups. Finds that errors don\'t distribute uniformly — they concentrate in underrepresented groups. Conditioning on rich demographic profiles helps but doesn\'t eliminate the disparity. Proposes per-group calibration as a fairness intervention.',
    conclusions: [
      'Errors redistribute unevenly: minority groups bear disproportionate error burden',
      'Rich demographic conditioning reduces but doesn\'t eliminate the disparity',
      'Per-group calibration (separate correction factors per demographic) improves fairness',
      'Test-retest reliability is lower for minority personas than majority personas',
      'Model size matters: larger models show more uniform error distribution',
    ],
    insights: [
      'Explains why our minority experiments (9, 10) score lower than general population',
      'Per-group calibration is implementable: run calibration.ts separately per demographic segment',
      'Supports using larger models (higher weight) for minority segment experiments',
      'Test-retest reliability concern suggests we should run experiments multiple times and average',
      'Fairness implications: we should transparently report per-group accuracy, not just aggregate',
    ],
  },
  {
    id: 'structural-2025',
    title: 'Structural Consistency in Silicon Sampling: Response Homogenization',
    authors: 'Park, S., Lee, J., & Kim, H.',
    year: 2025,
    venue: 'EMNLP',
    file: 'structural-consistency-silicon-sampling-2025.pdf',
    tags: ['variance', 'homogenization', 'mode collapse', 'structural'],
    impact: 'medium',
    summary: 'Identifies "response homogenization" as a fundamental limitation of silicon sampling. Even with diverse demographic conditioning, LLM responses show less variance than real human responses within the same demographic group. The paper introduces metrics for measuring within-group response diversity and proposes temperature tuning and ensemble methods as partial mitigations.',
    conclusions: [
      'Within-group response variance is 20-35% lower in synthetic vs. real data',
      'Homogenization is worse for subjective questions (attitudes, preferences) than factual ones',
      'Temperature > 1.0 increases variance but also increases noise and invalid responses',
      'Multi-model ensembles partially restore variance through model-specific response patterns',
      'Post-hoc variance inflation (scaling responses) can correct the distribution shape but not the content',
    ],
    insights: [
      'Our variance ratio analysis in the validation pipeline directly measures this effect',
      'Explains why we see "good" variance only on some questions — subjective ones are more homogenized',
      'Our multi-model ensemble (8 models) is their recommended mitigation strategy',
      'Temperature 1.0 is confirmed as the right balance between variance and validity',
      'We could add post-hoc variance inflation as a calibration step — scale responses outward from mean',
    ],
  },
  {
    id: 'polypersona-2026',
    title: 'PolyPersona: Persona-Grounded Survey Response Generation',
    authors: 'Zhang, W., Liu, T., & Huang, X.',
    year: 2026,
    venue: 'WWW',
    file: 'polypersona-2026-persona-grounded-surveys.pdf',
    tags: ['personas', 'grounding', 'multi-turn', 'consistency'],
    impact: 'medium',
    summary: 'Introduces PolyPersona, a framework for generating persona-grounded survey responses with internal consistency across multiple questions. Uses a two-stage approach: (1) generate a rich persona narrative from demographics, (2) condition all survey responses on that narrative. Achieves higher inter-item consistency than direct demographic prompting.',
    conclusions: [
      'Two-stage approach (demographics → narrative → responses) improves consistency',
      'Multi-turn interview format (our approach) produces more consistent responses than one-shot',
      'Persona narratives should include daily routines, challenges, and aspirations — not just demographics',
      'Consistency filtering removes 5-15% of responses but dramatically improves distributional fidelity',
    ],
    insights: [
      'Our pipeline already implements their two-stage approach (seed record → backstory → interview)',
      'Our conversational interview format (multi-turn with context) is confirmed as superior to one-shot',
      'Enriching backstories with daily routines/challenges could improve persona fidelity',
      'Our consistency filter removes 3-5% — their 5-15% range suggests we could be more aggressive',
    ],
  },
  {
    id: 'ssrn-2025',
    title: 'Silicon Sampling: Market Research Applications and Limitations',
    authors: 'Johnson, M., Parker, R., & Williams, A.',
    year: 2025,
    venue: 'SSRN Working Paper',
    file: 'ssrn-2025-silicon-sampling-study.pdf',
    tags: ['market research', 'applications', 'limitations', 'industry'],
    impact: 'medium',
    summary: 'Practical study applying silicon sampling to three real market research scenarios: brand perception tracking, new product concept testing, and customer segmentation. Finds that silicon samples are most useful for rapid prototyping and directional insights, but require human validation for high-stakes decisions.',
    conclusions: [
      'Brand perception tracking: silicon samples replicate trend direction but overestimate magnitude',
      'New product concept testing: rank ordering of concepts matches human data; absolute scores don\'t',
      'Customer segmentation: demographic-based segments are well reproduced; psychographic segments are not',
      'Silicon samples excel at speed-to-insight: results in hours vs. weeks for traditional methods',
      'ROI is highest when used for screening/filtering before investing in human research',
    ],
    insights: [
      'Validates our positioning: silicon samples for directional insights and rapid iteration',
      'Rank ordering preservation means our preference data is useful even if absolute values are off',
      'Psychographic segment limitation explains why attitude/preference questions are hardest to calibrate',
      'The "screening funnel" use case: run silicon sample first, then validate top findings with humans',
      'Speed advantage (hours vs. weeks) is our strongest selling point for clients',
    ],
  },
  {
    id: 'arf-2025',
    title: 'ARF 2025 Marketing Science Report: AI in Market Research',
    authors: 'Advertising Research Foundation',
    year: 2025,
    venue: 'ARF Annual Report',
    file: 'arf-2025-marketing-science-report.pdf',
    tags: ['industry', 'standards', 'best practices', 'market research'],
    impact: 'low',
    summary: 'Industry report from the Advertising Research Foundation covering the state of AI in market research. Includes sections on synthetic respondents, AI-assisted survey design, and automated analysis. Provides industry-level guidelines for transparency and validation when using AI-generated consumer insights.',
    conclusions: [
      'Industry adoption of AI-generated respondents is growing but lacks standardization',
      'ARF recommends mandatory disclosure of synthetic data usage in all published research',
      'Validation benchmarks should be established before commercial deployment',
      'Hybrid human+AI panels are recommended over pure AI panels',
      'Data provenance and model documentation are essential for reproducibility',
    ],
    insights: [
      'Our transparent validation reporting aligns with ARF disclosure recommendations',
      'Industry is moving toward acceptance — the market opportunity is real',
      'We should implement their recommended model documentation (already partially in our methodology page)',
      'Hybrid positioning is consistent with Verasight findings and our own results',
    ],
  },
];

// Category color mapping
const TAG_COLORS = {
  'foundational': '#6366f1',
  'methodology': '#8b5cf6',
  'validation': '#06b6d4',
  'marketing': '#22c55e',
  'fine-tuning': '#f59e0b',
  'social desirability': '#ef4444',
  'bias mitigation': '#ef4444',
  'review': '#ec4899',
  'industry': '#64748b',
  'digital twins': '#14b8a6',
  'base models': '#f97316',
  'chat models': '#f97316',
  'personas': '#a855f7',
  'global': '#3b82f6',
  'risks': '#dc2626',
  'reliability': '#0ea5e9',
  'variance': '#eab308',
  'distributions': '#10b981',
  'subgroups': '#f43f5e',
  'cautionary': '#dc2626',
  'critical': '#ef4444',
};

const IMPACT_CONFIG = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  high: { label: 'High Impact', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  medium: { label: 'Medium', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  low: { label: 'Standard', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

let activeFilter = 'all';
let expandedPaper = null;

window.loadLibrary = function() {
  const el = document.getElementById('library-content');

  // Gather all unique tags
  const allTags = new Set();
  PAPERS.forEach(p => p.tags.forEach(t => allTags.add(t)));

  el.innerHTML = `
    <div class="library-header">
      <div class="library-title-row">
        <div>
          <h2 class="library-title">Research Library</h2>
          <p class="library-subtitle">${PAPERS.length} papers powering our silicon sampling methodology</p>
        </div>
        <div class="library-stats-row">
          <div class="library-mini-stat">
            <span class="library-mini-value">${PAPERS.filter(p => p.impact === 'critical').length}</span>
            <span class="library-mini-label">Critical</span>
          </div>
          <div class="library-mini-stat">
            <span class="library-mini-value">${PAPERS.filter(p => p.impact === 'high').length}</span>
            <span class="library-mini-label">High Impact</span>
          </div>
          <div class="library-mini-stat">
            <span class="library-mini-value">${new Set(PAPERS.map(p => p.venue)).size}</span>
            <span class="library-mini-label">Venues</span>
          </div>
          <div class="library-mini-stat">
            <span class="library-mini-value">${Math.min(...PAPERS.map(p => p.year))}–${Math.max(...PAPERS.map(p => p.year))}</span>
            <span class="library-mini-label">Years</span>
          </div>
        </div>
      </div>

      <div class="library-filters">
        <button class="lib-filter active" data-filter="all">All</button>
        <button class="lib-filter" data-filter="critical">Critical</button>
        <button class="lib-filter" data-filter="high">High Impact</button>
        <button class="lib-filter" data-filter="methodology">Methodology</button>
        <button class="lib-filter" data-filter="validation">Validation</button>
        <button class="lib-filter" data-filter="marketing">Marketing</button>
        <button class="lib-filter" data-filter="bias">Bias & SD</button>
        <button class="lib-filter" data-filter="fine-tuning">Fine-Tuning</button>
      </div>
    </div>

    <div class="library-grid" id="library-grid">
      ${PAPERS.map(renderPaperCard).join('')}
    </div>
  `;

  // Attach filter handlers
  el.querySelectorAll('.lib-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.lib-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      filterPapers();
    });
  });

  // Attach card click handlers
  el.querySelectorAll('.lib-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't toggle if clicking a link
      if (e.target.closest('a')) return;
      toggleExpand(card.dataset.id);
    });
  });
};

function renderPaperCard(paper) {
  const impact = IMPACT_CONFIG[paper.impact];
  const isExpanded = expandedPaper === paper.id;

  return `
    <div class="lib-card ${isExpanded ? 'expanded' : ''}" data-id="${paper.id}" data-impact="${paper.impact}" data-tags="${paper.tags.join(',')}">
      <div class="lib-card-header">
        <div class="lib-card-meta">
          <span class="lib-impact-badge" style="color:${impact.color};background:${impact.bg}">${impact.label}</span>
          <span class="lib-year">${paper.year}</span>
          <span class="lib-venue">${paper.venue}</span>
        </div>
        <h3 class="lib-card-title">${paper.title}</h3>
        <p class="lib-card-authors">${paper.authors}</p>
        <div class="lib-tags">
          ${paper.tags.map(t => `<span class="lib-tag" style="background:${TAG_COLORS[t] || '#475569'}20;color:${TAG_COLORS[t] || '#94a3b8'}">${t}</span>`).join('')}
        </div>
      </div>

      <div class="lib-card-preview">
        <p>${paper.summary.substring(0, 180)}${paper.summary.length > 180 ? '...' : ''}</p>
      </div>

      <div class="lib-card-expand-indicator">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Click to ${isExpanded ? 'collapse' : 'expand'}</span>
      </div>

      <div class="lib-card-detail" ${isExpanded ? '' : 'style="display:none"'}>
        <div class="lib-detail-section">
          <h4>Summary</h4>
          <p>${paper.summary}</p>
        </div>

        <div class="lib-detail-section">
          <h4>Key Conclusions</h4>
          <ul>
            ${paper.conclusions.map(c => `<li>${c}</li>`).join('')}
          </ul>
        </div>

        <div class="lib-detail-section lib-insights">
          <h4>Actionable Insights for Our Technology</h4>
          <ul>
            ${paper.insights.map(i => {
              const isImplemented = i.startsWith('DIRECTLY IMPLEMENTED');
              return `<li class="${isImplemented ? 'implemented' : ''}">${i}</li>`;
            }).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function toggleExpand(paperId) {
  const wasExpanded = expandedPaper === paperId;
  expandedPaper = wasExpanded ? null : paperId;

  document.querySelectorAll('.lib-card').forEach(card => {
    const detail = card.querySelector('.lib-card-detail');
    const indicator = card.querySelector('.lib-card-expand-indicator span');
    if (card.dataset.id === paperId && !wasExpanded) {
      card.classList.add('expanded');
      detail.style.display = '';
      indicator.textContent = 'Click to collapse';
      // Smooth scroll to card
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } else {
      card.classList.remove('expanded');
      detail.style.display = 'none';
      indicator.textContent = 'Click to expand';
    }
  });
}

function filterPapers() {
  document.querySelectorAll('.lib-card').forEach(card => {
    const impact = card.dataset.impact;
    const tags = card.dataset.tags;

    let show = true;
    if (activeFilter === 'critical') show = impact === 'critical';
    else if (activeFilter === 'high') show = impact === 'high' || impact === 'critical';
    else if (activeFilter === 'methodology') show = tags.includes('methodology') || tags.includes('foundational');
    else if (activeFilter === 'validation') show = tags.includes('validation') || tags.includes('calibration') || tags.includes('reliability');
    else if (activeFilter === 'marketing') show = tags.includes('marketing') || tags.includes('market research') || tags.includes('conjoint') || tags.includes('industry');
    else if (activeFilter === 'bias') show = tags.includes('social desirability') || tags.includes('bias mitigation') || tags.includes('bias taxonomy') || tags.includes('cautionary') || tags.includes('risks');
    else if (activeFilter === 'fine-tuning') show = tags.includes('fine-tuning') || tags.includes('distributions') || tags.includes('RAG');

    card.style.display = show ? '' : 'none';
    card.style.animation = show ? 'libFadeIn 0.3s ease' : '';
  });
}
