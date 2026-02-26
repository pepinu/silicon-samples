import { chatCompletion } from './interview/openrouter.js';

const result = await chatCompletion('mistralai/mistral-small-3.2-24b-instruct', [
  { role: 'user', content: 'Say hello in exactly 5 words.' },
], { temperature: 1.0, maxTokens: 20 });

console.log('Response:', result.content);
console.log('Tokens:', result.inputTokens, 'in /', result.outputTokens, 'out');
console.log('API key works!');
process.exit(0);
