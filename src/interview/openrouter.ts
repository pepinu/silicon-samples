import { OPENROUTER_API_KEY, OPENROUTER_BASE_URL } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  model?: string;
}

// Simple concurrency limiter
let activeRequests = 0;
const queue: Array<() => void> = [];

function acquireSlot(maxConcurrency: number): Promise<void> {
  if (activeRequests < maxConcurrency) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => queue.push(resolve));
}

function releaseSlot() {
  activeRequests--;
  const next = queue.shift();
  if (next) {
    activeRequests++;
    next();
  }
}

export async function chatCompletion(
  modelId: string,
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    maxConcurrency?: number;
    maxRetries?: number;
  } = {}
): Promise<CompletionResult> {
  const {
    temperature = 1.0,
    maxTokens = 1024,
    maxConcurrency = 5,
    maxRetries = 3,
  } = options;

  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set. Copy .env.example to .env and add your key.');
  }

  await acquireSlot(maxConcurrency);

  try {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://github.com/silicon-samples',
            'X-Title': 'Silicon Samples',
          },
          body: JSON.stringify({
            model: modelId,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          if (response.status === 429) {
            // Rate limited — exponential backoff
            const wait = Math.min(1000 * Math.pow(2, attempt), 10000);
            console.warn(`Rate limited on ${modelId}, waiting ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          throw new Error(`OpenRouter API error ${response.status}: ${body}`);
        }

        const data = await response.json() as OpenRouterResponse;
        const content = data.choices?.[0]?.message?.content || '';
        const inputTokens = data.usage?.prompt_tokens || 0;
        const outputTokens = data.usage?.completion_tokens || 0;

        return {
          content,
          inputTokens,
          outputTokens,
          model: data.model || modelId,
        };
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries - 1) {
          const wait = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  } finally {
    releaseSlot();
  }
}
