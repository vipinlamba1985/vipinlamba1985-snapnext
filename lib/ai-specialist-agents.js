export const SPECIALIST_AGENT_VERSION = '2.0.0';

export const AGENT_STATUSES = Object.freeze({
  TRAINING: 'training',
  SHADOW: 'shadow',
  ASSISTED: 'assisted',
  CERTIFIED: 'certified',
});

export const SNAPNEXT_AGENT_STYLE = Object.freeze({
  productName: 'SnapNext Intelligence',
  tone: 'premium, warm, concise, trustworthy, action-oriented',
  behavior: [
    'Respond like a premium ChatGPT-style assistant, but always specialize in SnapNext memories, media, creation, backup, privacy, and organization.',
    'Explain what the AI is doing when the action is important, expensive, private, or irreversible.',
    'Give clear next actions instead of vague suggestions.',
    'Never pretend an agent is autonomous when it is still in Shadow Mode.',
    'Prefer external AI for final user-facing quality while SnapNext agents learn in the background.',
  ],
});

export const SPECIALIST_AGENT_CATALOG = Object.freeze({
  upload: {
    id: 'upload',
    name: 'Upload Agent',
    status: AGENT_STATUSES.SHADOW,
    purpose: 'Understands backup, upload, media intake, duplicate risk, and storage impact.',
    premiumPersonality: 'Careful media operations specialist',
    capabilities: ['media_precheck', 'backup_guidance', 'storage_signal', 'duplicate_hint'],
    risk: 'low',
  },
  memory: {
    id: 'memory',
    name: 'Memory Agent',
    status: AGENT_STATUSES.SHADOW,
    purpose: 'Turns photos and videos into meaningful life events, timelines, and memory summaries.',
    premiumPersonality: 'Personal life archivist',
    capabilities: ['event_grouping', 'timeline_summary', 'on_this_day', 'memory_context'],
    risk: 'medium',
  },
  search: {
    id: 'search',
    name: 'Search Agent',
    status: AGENT_STATUSES.SHADOW,
    purpose: 'Translates natural language into searchable people, place, date, event, and media filters.',
    premiumPersonality: 'Private memory search expert',
    capabilities: ['natural_language_filters', 'people_date_place_intent', 'search_ranking_hint'],
    risk: 'low',
  },
  creator: {
    id: 'creator',
    name: 'Creator Agent',
    status: AGENT_STATUSES.SHADOW,
    purpose: 'Creates captions, hashtags, stories, post ideas, scripts, and ready-to-post content.',
    premiumPersonality: 'Creative content director',
    capabilities: ['caption_plan', 'hashtag_plan', 'story_plan', 'video_script_plan'],
    risk: 'medium',
  },
  cleanup: {
    id: 'cleanup',
    name: 'Cleanup Agent',
    status: AGENT_STATUSES.SHADOW,
    purpose: 'Finds cleanup opportunities while protecting important memories from accidental deletion.',
    premiumPersonality: 'Safety-first storage optimizer',
    capabilities: ['duplicate_cleanup_plan', 'blur_hint', 'screenshot_hint', 'storage_cleanup_plan'],
    risk: 'high',
  },
  sharing: {
    id: 'sharing',
    name: 'Sharing Agent',
    status: AGENT_STATUSES.TRAINING,
    purpose: 'Plans permission-based favorite and family sharing without exposing private content.',
    premiumPersonality: 'Privacy-first sharing concierge',
    capabilities: ['permission_checklist', 'favorite_share_plan', 'private_share_guard'],
    risk: 'high',
  },
  video: {
    id: 'video',
    name: 'Video Agent',
    status: AGENT_STATUSES.TRAINING,
    purpose: 'Plans reels, scripts, storyboards, quality modes, and credit-aware video generation paths.',
    premiumPersonality: 'AI video creative producer',
    capabilities: ['video_task_estimate', 'scene_plan', 'script_plan', 'quality_mode_recommendation'],
    risk: 'high_cost',
  },
});

function textOf(task = '', input = {}) {
  return String(`${task} ${input?.topic || ''} ${input?.text || ''} ${input?.query || ''}`).toLowerCase();
}

function has(text, terms) {
  return terms.some((term) => text.includes(term));
}

function confidence(matches, total, base = 0.52) {
  return Math.min(0.94, Number((base + (matches / Math.max(1, total)) * 0.38).toFixed(2)));
}

export function chooseSpecialistAgent({ feature = 'chat', task = '', input = {} } = {}) {
  const text = textOf(task, input);
  const rules = [
    { id: 'video', feature: 'videoScript', terms: ['video', 'reel', 'movie', 'cinematic', 'storyboard', 'script'] },
    { id: 'sharing', feature: 'chat', terms: ['share', 'favorite', 'permission', 'family', 'send to'] },
    { id: 'cleanup', feature: 'chat', terms: ['duplicate', 'clean', 'cleanup', 'blurry', 'delete', 'storage full'] },
    { id: 'upload', feature: 'vision', terms: ['upload', 'backup', 'sync', 'photos', 'videos', 'library'] },
    { id: 'memory', feature: 'memorySummary', terms: ['memory', 'timeline', 'trip', 'birthday', 'on this day', 'album'] },
    { id: 'search', feature: 'chat', terms: ['find', 'search', 'show me', 'where', 'when'] },
    { id: 'creator', feature: 'postIdeas', terms: ['caption', 'hashtag', 'post', 'story', 'create', 'emoji'] },
  ];
  const match = rules.find((rule) => has(text, rule.terms));
  const id = match?.id || ({ caption: 'creator', hashtags: 'creator', emojis: 'creator', postIdeas: 'creator', story: 'memory', memorySummary: 'memory', vision: 'upload', videoScript: 'video' }[feature] || 'search');
  const agent = SPECIALIST_AGENT_CATALOG[id] || SPECIALIST_AGENT_CATALOG.search;
  const matchCount = match ? match.terms.filter((term) => text.includes(term)).length : 1;
  return {
    ...agent,
    selectedFeature: match?.feature || feature,
    confidence: confidence(matchCount, match?.terms?.length || 3),
    selectionReason: match ? `Matched ${agent.name} task language.` : `Mapped feature ${feature} to ${agent.name}.`,
  };
}

export function runSpecialistShadowPlan({ agent, feature, task = '', input = {}, economy = null, guardian = null } = {}) {
  const text = textOf(task, input);
  const common = {
    agentId: agent.id,
    agentName: agent.name,
    mode: 'shadow',
    status: agent.status,
    confidence: agent.confidence,
    premiumAssistantStyle: SNAPNEXT_AGENT_STYLE,
    safetyReminder: 'Final user-facing output still comes from external AI until this agent is certified.',
  };

  if (agent.id === 'video') {
    const quality = has(text, ['4k', 'cinematic', 'documentary', 'long']) ? 'premium_or_ultra' : 'balanced';
    return { ...common, plan: ['Confirm video goal', 'Estimate credits before generation', 'Build storyboard', 'Route to best video provider later'], recommendation: `Use ${quality} quality mode and show credit preview before execution.`, economy, guardian };
  }
  if (agent.id === 'creator') {
    return { ...common, plan: ['Understand platform and tone', 'Generate polished creative draft', 'Offer caption/hashtags/story variants', 'Save to AI history'], recommendation: 'Keep output ready-to-post but easy to edit.', economy, guardian };
  }
  if (agent.id === 'memory') {
    return { ...common, plan: ['Identify people/date/place/event signals', 'Summarize memory context', 'Suggest album or timeline placement', 'Avoid hallucinating unknown facts'], recommendation: 'Use warm memory language and cite only known context.', economy, guardian };
  }
  if (agent.id === 'search') {
    return { ...common, plan: ['Extract people/place/date/media filters', 'Search private memory index', 'Rank likely matches', 'Ask clarification when confidence is low'], recommendation: 'Return precise filters and explain search confidence.', economy, guardian };
  }
  if (agent.id === 'cleanup') {
    return { ...common, plan: ['Detect cleanup type', 'Separate safe suggestions from risky actions', 'Require confirmation before delete', 'Prioritize storage savings'], recommendation: 'Never delete automatically. Show review queue first.', economy, guardian };
  }
  if (agent.id === 'sharing') {
    return { ...common, plan: ['Check favorite relationship', 'Validate permission', 'Suggest safe share scope', 'Block private leakage'], recommendation: 'Require explicit approval before sharing any memory.', economy, guardian };
  }
  return { ...common, plan: ['Classify task', 'Check media/storage context', 'Suggest next safe action'], recommendation: 'Keep backup flow simple and safe.', economy, guardian };
}

export function getSpecialistAgentStatus() {
  return {
    ok: true,
    version: SPECIALIST_AGENT_VERSION,
    style: SNAPNEXT_AGENT_STYLE,
    agents: Object.values(SPECIALIST_AGENT_CATALOG).map((agent) => ({
      ...agent,
      learningMode: agent.status === AGENT_STATUSES.CERTIFIED ? 'can_execute' : 'shadow_learning',
      certificationRequired: agent.status !== AGENT_STATUSES.CERTIFIED,
      promotionThreshold: {
        minimumTasks: 1000,
        minimumUserApprovalRate: 0.9,
        maximumFallbackFailureRate: 0.05,
        minimumConfidence: 0.92,
      },
    })),
  };
}
