import { chatCompletion, type ChatMessage } from './openrouter.js';
import type { Question } from './question-bank.js';
import type { Persona } from '../persona/types.js';
import { trackCost } from '../experiment/cost-tracker.js';

export interface InterviewResponse {
  questionId: string;
  questionText: string;
  questionType: string;
  rawResponse: string;
  parsedValue: number | null;
  likertValue: number | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

const SYSTEM_PROMPT_TEMPLATE = `You are participating in a market research study. You are a real person with the following background:

{backstory}

IMPORTANT INSTRUCTIONS:
- Answer all questions honestly and naturally based on your background
- Stay completely in character — do not break character or mention that you are an AI
- For scale questions (1-7), respond with JUST the number first, then optionally explain briefly
- For multiple choice questions, respond with the EXACT text of your chosen option first, then optionally explain
- For numeric questions, respond with JUST the number first, then optionally explain
- For open-ended questions, respond naturally in 2-4 sentences
- Your answers should reflect realistic variation — not every answer needs to be moderate
- Draw on your specific demographic background to inform your responses`;

function buildSystemPrompt(persona: Persona): string {
  return SYSTEM_PROMPT_TEMPLATE.replace('{backstory}', persona.backstory);
}

function parseResponse(raw: string, question: Question): { parsed: number | null; likert: number | null } {
  const trimmed = raw.trim();

  if (question.type === 'likert') {
    const match = trimmed.match(/^(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      const min = question.scale?.min ?? 1;
      const max = question.scale?.max ?? 7;
      if (val >= min && val <= max) {
        return { parsed: val, likert: val };
      }
    }
    return { parsed: null, likert: null };
  }

  if (question.type === 'numeric') {
    const match = trimmed.match(/^(\d+(?:\.\d+)?)/);
    if (match) {
      const val = parseFloat(match[1]);
      return { parsed: val, likert: null };
    }
    return { parsed: null, likert: null };
  }

  if (question.type === 'multiple_choice' && question.options) {
    const lower = trimmed.toLowerCase();
    for (let i = 0; i < question.options.length; i++) {
      if (lower.startsWith(question.options[i].toLowerCase())) {
        return { parsed: i + 1, likert: null };
      }
    }
    // Fuzzy match: check if any option is contained in the first line
    const firstLine = lower.split('\n')[0];
    for (let i = 0; i < question.options.length; i++) {
      if (firstLine.includes(question.options[i].toLowerCase())) {
        return { parsed: i + 1, likert: null };
      }
    }
    return { parsed: null, likert: null };
  }

  // open_ended — no numeric parsing
  return { parsed: null, likert: null };
}

export async function conductInterview(
  persona: Persona,
  questions: Question[],
  experimentId: number,
  options: {
    temperature?: number;
    maxConcurrency?: number;
  } = {}
): Promise<InterviewResponse[]> {
  const { temperature = 1.0, maxConcurrency = 5 } = options;
  const systemPrompt = buildSystemPrompt(persona);
  const responses: InterviewResponse[] = [];

  // Conversational flow: maintain conversation history
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const question of questions) {
    // Add the question
    let questionPrompt = question.text;
    if (question.type === 'multiple_choice' && question.options) {
      questionPrompt += '\n\nOptions:\n' + question.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
      questionPrompt += '\n\nPlease respond with the text of your chosen option.';
    }

    messages.push({ role: 'user', content: questionPrompt });

    const result = await chatCompletion(persona.modelId, messages, {
      temperature,
      maxTokens: 512,
      maxConcurrency,
    });

    messages.push({ role: 'assistant', content: result.content });

    const { parsed, likert } = parseResponse(result.content, question);

    const cost = trackCost(experimentId, persona.modelId, result.inputTokens, result.outputTokens);

    responses.push({
      questionId: question.id,
      questionText: question.text,
      questionType: question.type,
      rawResponse: result.content,
      parsedValue: parsed,
      likertValue: likert,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cost,
    });

    // If there's a follow-up probe, ask it
    if (question.followUp) {
      messages.push({ role: 'user', content: question.followUp });

      const followUpResult = await chatCompletion(persona.modelId, messages, {
        temperature,
        maxTokens: 512,
        maxConcurrency,
      });

      messages.push({ role: 'assistant', content: followUpResult.content });

      const followUpCost = trackCost(experimentId, persona.modelId, followUpResult.inputTokens, followUpResult.outputTokens);

      responses.push({
        questionId: question.id + '_followup',
        questionText: question.followUp,
        questionType: 'open_ended',
        rawResponse: followUpResult.content,
        parsedValue: null,
        likertValue: null,
        inputTokens: followUpResult.inputTokens,
        outputTokens: followUpResult.outputTokens,
        cost: followUpCost,
      });
    }
  }

  return responses;
}
