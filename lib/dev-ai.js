import OpenAI from 'openai';

const REPO = process.env.DEV_AI_REPO || 'vipinlamba1985/vipinlamba1985-snapnext';
const DEFAULT_BRANCH = process.env.DEV_AI_DEFAULT_BRANCH || 'main';
const MAX_TOOL_LOOPS = 5;

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
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

async function readRepoFile({ path, ref = DEFAULT_BRANCH }) {
  const file = await githubJson(`/contents/${encodeURIComponent(path).replaceAll('%2F', '/')}?ref=${encodeURIComponent(ref)}`);
  if (file.type !== 'file' || !file.content) throw new Error('Path is not a readable text file.');
  const text = Buffer.from(file.content, 'base64').toString('utf8');
  return {
    path: file.path,
    sha: file.sha,
    ref,
    content: text.slice(0, 30000),
    truncated: text.length > 30000,
  };
}

async function listRepoTree({ ref = DEFAULT_BRANCH, path = '' }) {
  const data = await githubJson(`/contents/${encodeURIComponent(path).replaceAll('%2F', '/')}?ref=${encodeURIComponent(ref)}`);
  const rows = Array.isArray(data) ? data : [data];
  return rows.slice(0, 200).map((item) => ({ path: item.path, type: item.type, size: item.size || 0, sha: item.sha }));
}

async function searchRepo({ query }) {
  const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(`${query} repo:${REPO}`)}&per_page=20`, {
    headers: githubHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GitHub search ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return (data.items || []).map((item) => ({ path: item.path, sha: item.sha, url: item.html_url }));
}

async function recentCommits({ ref = DEFAULT_BRANCH, limit = 10 }) {
  const rows = await githubJson(`/commits?sha=${encodeURIComponent(ref)}&per_page=${Math.min(20, Math.max(1, Number(limit) || 10))}`);
  return rows.map((row) => ({ sha: row.sha, message: row.commit?.message, author: row.commit?.author?.name, date: row.commit?.author?.date }));
}

const TOOLS = [
  {
    type: 'function',
    name: 'read_repo_file',
    description: 'Read a UTF-8 source file from the SnapNext repository. Use this before making claims about implementation details.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        ref: { type: 'string' },
      },
      required: ['path'],
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
        path: { type: 'string' },
        ref: { type: 'string' },
      },
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'search_repo',
    description: 'Search the SnapNext repository for code matching a query.',
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
        ref: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
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
2. Be honest about uncertainty and missing environment variables.
3. Diagnose root cause before suggesting code changes.
4. Prefer small, reversible changes and preserve existing features.
5. Never claim code was changed, deployed, or merged. This read-only version cannot write.
6. Never suggest direct edits to main. Recommend a feature/fix branch and validation plan.
7. Security, privacy, AI cost, user trust, and backward compatibility are first-class requirements.
8. When asked to implement something, return: Diagnosis, Plan, Files to inspect/change, Risks, Validation.
9. Keep responses practical and specific to the actual repository.
10. Do not expose secrets, tokens, environment values, or private user data.

You are part of SnapNext AI OS and may reason across Organizer, People, Memory, Search, Creation, Protection, Safety, Cost, and Supervisor agents.`;
}

export async function runDevAI({ message, history = [] }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured for SnapNext Dev AI.');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const model = process.env.OPENAI_DEV_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';

  const compactHistory = history.slice(-12).map((row) => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: String(row.content || '').slice(0, 12000) }));
  let input = [...compactHistory, { role: 'user', content: String(message || '').slice(0, 20000) }];
  let response;
  const toolTrace = [];

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
    response = await client.responses.create({
      model,
      instructions: systemInstructions(),
      input,
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      max_output_tokens: 5000,
      store: false,
    });

    const calls = (response.output || []).filter((item) => item.type === 'function_call');
    if (!calls.length) break;

    input = [...input, ...response.output];
    for (const call of calls) {
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
