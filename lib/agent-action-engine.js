import { v4 as uuidv4 } from 'uuid';
import { generateAiText } from '@/lib/ai-provider-router';
import { retrieveGroundedMemoryContext } from '@/lib/ai-memory-retrieval';
import { AGENT_TOOL_DEFINITIONS, executeAgentTool, listAgentTools, normalizeAgentToolInput } from '@/lib/agent-tools';

function text(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanPlanItem(item) {
  const toolName = text(item?.toolName || item?.tool, 80);
  if (!AGENT_TOOL_DEFINITIONS[toolName]) return null;
  try {
    return {
      toolName,
      input: normalizeAgentToolInput(toolName, item?.input || item?.arguments || {}),
      reason: text(item?.reason, 500) || 'Requested by the user.',
      evidenceMediaIds: Array.isArray(item?.evidenceMediaIds) ? [...new Set(item.evidenceMediaIds.map((id) => text(id, 120)).filter(Boolean))].slice(0, 20) : [],
    };
  } catch {
    return null;
  }
}

async function currentAgentState(db, userId) {
  const [tasks, collections] = await Promise.all([
    db.collection('agent_tasks').find({ userId, status: { $ne: 'completed' } }, { projection: { _id: 0, id: 1, title: 1, priority: 1, dueDate: 1, status: 1 } }).sort({ createdAt: -1 }).limit(30).toArray(),
    db.collection('agent_collections').find({ userId }, { projection: { _id: 0, id: 1, name: 1, description: 1, mediaIds: 1 } }).sort({ updatedAt: -1 }).limit(30).toArray(),
  ]);
  return {
    openTasks: tasks,
    collections: collections.map((item) => ({ ...item, mediaIds: Array.isArray(item.mediaIds) ? item.mediaIds.slice(0, 50) : [] })),
  };
}

export async function planAgentActions({ db, user, requestText }) {
  const promptText = text(requestText, 1800);
  if (!promptText) throw new Error('A task request is required.');

  const [memory, currentState] = await Promise.all([
    retrieveGroundedMemoryContext(db, user.id, promptText),
    currentAgentState(db, user.id),
  ]);
  const tools = listAgentTools();
  const prompt = `You are the SnapNext Action Planner. Turn the user's request into zero to five safe internal SnapNext actions.

Rules:
- Use only the allowed tools listed below.
- Never invent media ids, task ids, collection ids, people, dates, or facts.
- Use task ids and collection ids only from VERIFIED CURRENT APP STATE.
- Use evidenceMediaIds only from VERIFIED MEMORY CONTEXT.
- Do not send, publish, share, delete, move, purchase, email, message, or call external services.
- If the request needs a tool that is unavailable, return no action for that part.
- Every proposed action will require explicit user approval before execution.
- Return valid JSON only in this shape: {"summary":"...","actions":[{"toolName":"...","input":{},"reason":"...","evidenceMediaIds":[]}]}

ALLOWED TOOLS:
${JSON.stringify(tools)}

USER REQUEST:
${promptText}

VERIFIED CURRENT APP STATE:
${JSON.stringify(currentState)}

VERIFIED MEMORY CONTEXT:
${memory.promptBlock}`;

  let parsed = { summary: 'I found no safe app action to propose.', actions: [] };
  try {
    const result = await generateAiText({
      task: 'agent',
      json: true,
      systemInstruction: 'Return valid JSON only. Never call unavailable tools. Never fabricate ids or evidence.',
      prompt: prompt.slice(0, 14000),
    });
    parsed = JSON.parse(String(result.text || '').replace(/```json|```/g, '').trim());
  } catch {
    parsed = { summary: 'I could not safely prepare an action plan.', actions: [] };
  }

  const selectedIds = new Set(memory.selected.map((item) => item.id));
  const taskIds = new Set(currentState.openTasks.map((item) => item.id));
  const collectionIds = new Set(currentState.collections.map((item) => item.id));
  const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
    .map(cleanPlanItem)
    .filter(Boolean)
    .map((item) => ({ ...item, evidenceMediaIds: item.evidenceMediaIds.filter((id) => selectedIds.has(id)) }))
    .filter((item) => item.toolName !== 'complete_task' || taskIds.has(item.input.taskId))
    .filter((item) => item.toolName !== 'add_assets_to_collection' || collectionIds.has(item.input.collectionId))
    .slice(0, 5);

  const now = new Date();
  const planId = uuidv4();
  const docs = actions.map((item, index) => ({
    id: uuidv4(),
    planId,
    sequence: index + 1,
    userId: user.id,
    requestText: promptText,
    summary: text(parsed.summary, 1000) || 'SnapNext prepared an action plan.',
    toolName: item.toolName,
    input: item.input,
    reason: item.reason,
    evidenceMediaIds: item.evidenceMediaIds,
    risk: AGENT_TOOL_DEFINITIONS[item.toolName].risk,
    approvalRequired: true,
    reversible: AGENT_TOOL_DEFINITIONS[item.toolName].reversible,
    status: 'proposed',
    createdAt: now,
    updatedAt: now,
  }));

  if (docs.length) await db.collection('agent_actions').insertMany(docs);
  return {
    planId,
    summary: docs[0]?.summary || text(parsed.summary, 1000) || 'No safe actions were proposed.',
    matchedMediaIds: memory.selected.map((item) => item.id),
    actions: docs,
  };
}

export async function listAgentActions({ db, userId, status, limit = 50 }) {
  const query = { userId };
  if (status) query.status = status;
  return db.collection('agent_actions').find(query).sort({ createdAt: -1 }).limit(Math.max(1, Math.min(100, limit))).toArray();
}

export async function approveAndExecuteAgentAction({ db, userId, actionId }) {
  const now = new Date();
  const action = await db.collection('agent_actions').findOneAndUpdate(
    { id: actionId, userId, status: 'proposed' },
    { $set: { status: 'executing', approvedAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  );
  if (!action) throw new Error('Action not found or already handled.');

  try {
    const result = await executeAgentTool({ db, userId, toolName: action.toolName, input: action.input, actionId: action.id });
    const completedAt = new Date();
    await db.collection('agent_actions').updateOne(
      { id: action.id, userId },
      { $set: { status: 'completed', result, completedAt, verifiedAt: completedAt, updatedAt: completedAt } },
    );
    return { ...action, status: 'completed', result, completedAt, verifiedAt: completedAt };
  } catch (error) {
    const failedAt = new Date();
    await db.collection('agent_actions').updateOne(
      { id: action.id, userId },
      { $set: { status: 'failed', error: text(error?.message || 'Action failed.', 1000), failedAt, updatedAt: failedAt } },
    );
    throw error;
  }
}

export async function cancelAgentAction({ db, userId, actionId }) {
  const now = new Date();
  const action = await db.collection('agent_actions').findOneAndUpdate(
    { id: actionId, userId, status: 'proposed' },
    { $set: { status: 'cancelled', cancelledAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  );
  if (!action) throw new Error('Action not found or already handled.');
  return action;
}
