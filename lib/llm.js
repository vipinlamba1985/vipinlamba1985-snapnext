import { runAiTask } from '@/lib/ai-router-budgeted';

function missingContext() {
  const error = new Error('SnapNext AI calls must go through the authenticated AI provider router.');
  error.code = 'ai_service_unavailable';
  return error;
}

// Compatibility exports. Production AI calls are routed through the budgeted
// AI gateway with auth, plan checks, quota checks, usage tracking, and provider selection.
export async function generateCaption() { throw missingContext(); }
export async function generateHashtags() { throw missingContext(); }
export async function generateEmojis() { throw missingContext(); }
export async function generatePostIdeas() { throw missingContext(); }
export async function generateMemorySummary() { throw missingContext(); }
export async function generateStory() { throw missingContext(); }

export { runAiTask };
