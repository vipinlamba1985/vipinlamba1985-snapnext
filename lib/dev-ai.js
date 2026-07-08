import OpenAI from 'openai';

const REPO = process.env.DEV_AI_REPO || 'vipinlamba1985/vipinlamba1985-snapnext';
const DEFAULT_BRANCH = process.env.DEV_AI_DEFAULT_BRANCH || 'main';
const MAX_TOOL_LOOPS = 4;
const MAX_TOOL_CALLS = 12;
const MAX_OUTPUT_TOKENS = 3500;

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'snapnext-dev-ai',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: githubHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${await response.text()}`);
  return response.json();
}

function safeRef(value) {
  const ref = String(value || '').trim();
  return ref || DEFAULT_BRANCH;
}

async function readRepoFile({ path, ref }) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath || cleanPath.includes('..')) throw new Error('A valid repository file path is required.');
  const targetRef = safeRef(ref);
  const file = await githubJson(`/contents/${encodeURIComponent(cleanPath).replaceAll('%2F', '/')}?ref=${encodeURIComponent(targetRef)}`);
  if (file.type !== 'file' || !file.content) throw new Error('Path is not a readable text file.');
  const text = Buffer.from(file.content, 'base64').toString('utf8');
  return {
    path: file.path,
    sha: file.sha,
    ref: targetRef,
    content: text.slice(0, 30000),
    truncated: text.length > 30000,
  };
}

async function listRepoTree({ ref, path }) {
  const cleanPath = String(path || '').trim();
  if (cleanPath.includes('..')) throw new Error('Invalid repository path.');
  const targetRef = safeRef(ref);
  const encodedPath = encodeURIComponent(cleanPath).replaceAll('%2F', '/');
  const data = await githubJson(`/contents/${encodedPath}?ref=${encodeURIComponent(targetRef)}`);
  const rows = Array.isArray(data) ? data : [data];
  return rows.slice(0, 200).map((item) => ({ path: item.path, type: item.type, size: item.size || 0, sha: item.sha }));
}

async function searchRepo({ query }) {
  const cleanQuery = String(query || '').trim().slice(0, 200);
  if (!cleanQuery) throw new Error('Search query is required.');
  const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(`${cleanQuery} repo:${REPO}`)}&per_page=20`, {
    headers: githubHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('GitHub code search requires a configured GITHUB_TOKEN. Use list_repo_tree and read_repo_file instead.');
    }
    throw new Error(`GitHub search ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  return (data.items || []).map((item) => ({ path: item.path, sha: item.sha, url: item.html_url }));
}

async function recentCommits({ ref, limit }) {
  const targetRef = safeRef(ref);
  const safeLimit = Math.min(20, Math.max(1, Number(limit) || 10));
  const rows = await githubJson(`/commits?sha=${encodeURIComponent(targetRef)}&per_page=${safeLimit}`);
  return rows.map((row) => ({ sha: row.sha, message: row.commit?.message, author: row.commit?.author?.name, date: row.commit?.author?.date }));
}

const TOOLS = [
  {
    type: 'function',
    name: 'read_repo_file',
    description: 'Read a UTF-8 source file from the SnapNext repository. Use this before making implementation claims.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        ref: { type: 'string', description: 'Branch, tag, or commit. Use main when unsure.' },
      },
      required: ['path', 'ref'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'list_repo_tree',
    description: 'List files and folders at a repository path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repository folder path. Use an empty string for repository root.' },
        ref: { type: 'string', description: 'Branch, tag, or commit. Use main when unsure.' },
      },
      required: ['path', 'ref'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'search_repo',
    description: 'Search the SnapNext repository for code matching a query. If unavailable, use tree listing and file reads.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'recent_commits',
    description: 'Read recent commits on a repository branch or ref.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Branch, tag, or commit. Use main when unsure.' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['ref', 'limit'],
      additionalProperties: false,
    },
    strict: true,
  },
];

async function runTool(name, args) {
  if (name === 'read_repo_file') return readRepoFile(args);
  if (name === 'list_repo_tree') return listRepoTree(args);
  if (name === 'search_repo') return searchRepo(args);
  if (name === 'recent_commits') return recentCommits(args);
  throw new Error(`Unknown tool: ${name}`);
}

function systemInstructions() {
  return `You are SnapNext Dev AI, the internal senior engineering agent for SnapNext AI.

Repository: ${REPO}
Default branch: ${DEFAULT_BRANCH}

Your rules:
1. Inspect the repository with tools before making implementation claims.
2. Be honest about uncertainty, tool failures, and missing environment variables.
3. Diagnose root cause before suggesting code changes.
4. Prefer small, reversible changes and preserve existing features.
5. Never claim code was changed, deployed, or merged. This read-only version cannot write.
6. Never suggest direct edits to main. Recommend a feature/fix branch and validation plan.
7. Security, privacy, AI cost, user trust, and backward compatibility are first-class requirements.
8. When asked to implement something, return: Diagnosis, Plan, Files to inspect/change, Risks, Validation.
9. Keep responses practical and specific to the actual repository.
10. Do not expose secrets, tokens, environment values, or private user data.
11. Do not read arbitrary URLs, external systems, or files outside the configured repository.
12. Keep tool use economical. Read only the files necessary to answer the task.

You are part of SnapNext AI OS and may reason across Organizer, People, Memory, Search, Creation, Protection, Safety, Cost, and Supervisor agents.`;
}

export async function runDevAI({ message, history = [] }) {
  const apiKey = process.env.OPENAI_DEV_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_DEV_API_KEY or OPENAI_API_KEY is not configured for SnapNext Dev AI.');

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_DEV_BASE_URL || undefined,
  });
  const model = process.env.OPENAI_DEV_MODEL || 'gpt-5.5';

  const compactHistory = history.slice(-10).map((row) => ({
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content || '').slice(0, 8000),
  }));
  let input = [...compactHistory, { role: 'user', content: String(message || '').slice(0, 16000) }];
  let response;
  const toolTrace = [];
  let toolCallsUsed = 0;

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    response = await client.responses.create({
      model,
      instructions: systemInstructions(),
      input,
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    });

    const calls = (response.output || []).filter((item) => item.type === 'function_call');
    if (!calls.length) break;

    const allowedCalls = calls.slice(0, Math.max(0, MAX_TOOL_CALLS - toolCallsUsed));
    if (!allowedCalls.length) break;
    toolCallsUsed += allowedCalls.length;
    input = [...input, ...response.output];

    for (const call of allowedCalls) {
      let output;
      try {
        const args = JSON.parse(call.arguments || '{}');
        output = await runTool(call.name, args);
        toolTrace.push({ tool: call.name, ok: true, args });
      } catch (error) {
        output = { error: error?.message || 'Tool failed' };
        toolTrace.push({ tool: call.name, ok: false, error: output.error });
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) });
    }
  }

  return {
    model,
    text: response?.output_text || 'Dev AI did not return a response.',
    tools: toolTrace,
    usage: response?.usage || null,
  };
}
