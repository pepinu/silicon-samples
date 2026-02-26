import { getDb } from '../data/db.js';
import { sampleRecords } from '../persona/sampler.js';
import { buildBackstory } from '../persona/backstory.js';
import { assignModels } from '../persona/model-assigner.js';
import { conductInterview } from '../interview/conductor.js';
import { getQuestionSet } from '../interview/question-bank.js';
import { checkBudget, getExperimentCost } from './cost-tracker.js';
import { generateReport, type ValidationReport } from '../validation/report.js';
import type { ExperimentConfig, ExperimentProgress, ExperimentStatus } from './types.js';
import type { Persona, Demographics } from '../persona/types.js';

type ProgressCallback = (progress: ExperimentProgress) => void;

export async function runExperiment(
  config: ExperimentConfig,
  onProgress?: ProgressCallback
): Promise<{ experimentId: number; report: ValidationReport }> {
  const db = getDb();

  // Create experiment record
  const result = db.prepare(`
    INSERT INTO experiments (name, dataset, persona_count, model_ids, question_set, temperature, budget_limit, status, config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'sampling', ?)
  `).run(
    config.name,
    config.dataset,
    config.personaCount,
    JSON.stringify(config.modelIds),
    config.questionSetId,
    config.temperature,
    config.budgetLimit,
    JSON.stringify(config),
  );

  const experimentId = Number(result.lastInsertRowid);
  const errors: string[] = [];

  const emit = (status: ExperimentStatus, extra: Partial<ExperimentProgress> = {}) => {
    const costInfo = getExperimentCost(experimentId);
    onProgress?.({
      status,
      personasGenerated: extra.personasGenerated ?? 0,
      personasInterviewed: extra.personasInterviewed ?? 0,
      totalPersonas: config.personaCount,
      costSoFar: costInfo.totalCost,
      budgetLimit: config.budgetLimit,
      errors,
      ...extra,
    });
  };

  try {
    // Phase 1: Sample records
    emit('sampling');
    const seedRecords = sampleRecords(config.dataset, config.personaCount, config.filter);
    const models = assignModels(config.personaCount, config.modelIds);

    // Phase 2: Build personas
    const personas: Persona[] = [];
    const insertPersona = db.prepare(`
      INSERT INTO personas (experiment_id, seed_record_id, model_id, backstory, demographics_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < seedRecords.length; i++) {
      const record = seedRecords[i];
      const model = models[i];
      const rawData = JSON.parse(record.raw_json) as Record<string, unknown>;

      const demographics: Demographics = {
        age: record.age,
        gender: record.gender,
        education: record.education,
        marital_status: record.marital_status,
        income: record.income,
        race: record.race,
        occupation: record.occupation,
        region: record.region,
        kids: record.kids,
        household_size: record.household_size,
      };

      const backstory = buildBackstory(demographics, rawData);

      const personaResult = insertPersona.run(
        experimentId,
        record.id,
        model.id,
        backstory,
        JSON.stringify(demographics),
      );

      personas.push({
        id: Number(personaResult.lastInsertRowid),
        experimentId,
        seedRecordId: record.id,
        modelId: model.id,
        backstory,
        demographics,
        rawData,
      });

      emit('sampling', { personasGenerated: i + 1 });
    }

    // Phase 3: Conduct interviews
    db.prepare('UPDATE experiments SET status = ? WHERE id = ?').run('interviewing', experimentId);
    emit('interviewing', { personasGenerated: personas.length });

    const questionSet = getQuestionSet(config.questionSetId);
    if (!questionSet) throw new Error(`Question set "${config.questionSetId}" not found`);

    const insertResponse = db.prepare(`
      INSERT INTO responses (persona_id, question_id, question_text, question_type, raw_response, parsed_value, likert_value, input_tokens, output_tokens, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i];

      // Budget check
      const budget = checkBudget(experimentId, config.budgetLimit);
      if (!budget.within) {
        errors.push(`Budget exceeded ($${budget.spent.toFixed(4)} / $${config.budgetLimit}). Stopping at persona ${i + 1}/${personas.length}.`);
        break;
      }

      try {
        const responses = await conductInterview(persona, questionSet.questions, experimentId, {
          temperature: config.temperature,
        });

        // Store responses
        for (const r of responses) {
          insertResponse.run(
            persona.id,
            r.questionId,
            r.questionText,
            r.questionType,
            r.rawResponse,
            r.parsedValue,
            r.likertValue,
            r.inputTokens,
            r.outputTokens,
            r.cost,
          );
        }
      } catch (err) {
        const msg = `Persona ${persona.id} interview failed: ${(err as Error).message}`;
        errors.push(msg);
        console.error(msg);
      }

      emit('interviewing', {
        personasGenerated: personas.length,
        personasInterviewed: i + 1,
        currentPersona: `Persona ${i + 1} (${persona.modelId.split('/')[1]})`,
      });
    }

    // Phase 4: Validate
    db.prepare('UPDATE experiments SET status = ? WHERE id = ?').run('validating', experimentId);
    emit('validating', {
      personasGenerated: personas.length,
      personasInterviewed: personas.length,
    });

    const report = generateReport(experimentId);

    // Phase 5: Complete
    db.prepare('UPDATE experiments SET status = ?, completed_at = datetime(?) WHERE id = ?')
      .run('completed', 'now', experimentId);

    emit('completed', {
      personasGenerated: personas.length,
      personasInterviewed: personas.length,
    });

    return { experimentId, report };
  } catch (err) {
    db.prepare('UPDATE experiments SET status = ? WHERE id = ?').run('failed', experimentId);
    errors.push((err as Error).message);
    emit('failed');
    throw err;
  }
}
