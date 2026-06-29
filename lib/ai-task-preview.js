import { estimateAiEconomy, QUALITY_MODES } from '@/lib/ai-os';
import { chooseSpecialistAgent, runSpecialistShadowPlan } from '@/lib/ai-specialist-agents';
import { getAgentScorecards, getBusinessIntelligenceSnapshot } from '@/lib/ai-learning-engine';

export const AI_TASK_PREVIEW_VERSION = '5.0.0';

export const VIDEO_PROVIDER_CATALOG = Object.freeze({
  veo: { id: 'veo', name: 'Google Veo', bestFor: 'premium cinematic realism', quality: 'ultra', estimatedCostLevel: 'high' },
  runway: { id: 'runway', name: 'Runway', bestFor: 'fast social and marketing video workflows', quality: 'premium', estimatedCostLevel: 'medium_high' },
  kling: { id: 'kling', name: 'Kling', bestFor: 'creative short-form motion', quality: 'premium', estimatedCostLevel: 'medium_high' },
  luma: { id: 'luma', name: 'Luma Dream Machine', bestFor: 'image-to-video memory animation', quality: 'balanced', estimatedCostLevel: 'medium' },
  local_storyboard: { id: 'local_storyboard', name: 'SnapNext Storyboard', bestFor: 'low-cost planning before generation', quality: 'economy', estimatedCostLevel: 'low' },
});

function taskText(task = '', input = {}) {
  return String(`${task} ${input?.topic || ''} ${input?.text || ''}`).toLowerCase();
}

export function selectVideoProvider({ task = '', input = {}, qualityMode = QUALITY_MODES.BALANCED } = {}) {
  const text = taskText(task, input);
  if (qualityMode === QUALITY_MODES.ECONOMY) return VIDEO_PROVIDER_CATALOG.local_storyboard;
  if (text.includes('4k') || text.includes('cinematic') || text.includes('documentary')) return VIDEO_PROVIDER_CATALOG.veo;
  if (text.includes('marketing') || text.includes('product') || text.includes('ad')) return VIDEO_PROVIDER_CATALOG.runway;
  if (text.includes('tiktok') || text.includes('shorts') || text.includes('reel')) return VIDEO_PROVIDER_CATALOG.kling;
  if (text.includes('photo') || text.includes('image')) return VIDEO_PROVIDER_CATALOG.luma;
  return qualityMode === QUALITY_MODES.ULTRA ? VIDEO_PROVIDER_CATALOG.veo : VIDEO_PROVIDER_CATALOG.runway;
}

export async function previewAiTask({ db, user, task = '', feature = 'chat', input = {}, media = null, qualityMode = QUALITY_MODES.BALANCED }) {
  const selectedAgent = chooseSpecialistAgent({ feature, task, input });
  const routedFeature = selectedAgent.selectedFeature || feature;
  const economy = await estimateAiEconomy({ db, user, feature: routedFeature, qualityMode, prompt: task, input });
  const shadowPlan = runSpecialistShadowPlan({ agent: selectedAgent, feature: routedFeature, task, input, economy, guardian: { status: 'preview_only' } });
  const isVideo = selectedAgent.id === 'video' || routedFeature === 'videoScript';
  const videoProvider = isVideo ? selectVideoProvider({ task, input, qualityMode }) : null;

  return {
    ok: true,
    version: AI_TASK_PREVIEW_VERSION,
    task: String(task).slice(0, 500),
    selectedAgent,
    routedFeature,
    qualityMode,
    economy,
    shadowPlan,
    videoProvider,
    userMessage: buildUserMessage({ economy, selectedAgent, videoProvider }),
    options: economy.userOptions || [],
    requiresUserChoice: !economy.allowed || isVideo || economy.requiredCredits > 5,
  };
}

function buildUserMessage({ economy, selectedAgent, videoProvider }) {
  if (!economy?.allowed) {
    return 'This AI task needs more credits or a lower-cost quality mode before SnapNext continues.';
  }
  if (videoProvider) {
    return `This looks like a premium video task. SnapNext recommends ${videoProvider.name} for ${videoProvider.bestFor}, with a credit preview before generation.`;
  }
  return `${selectedAgent.name} can handle this in Shadow Mode while external AI protects final quality.`;
}

export async function getCertificationPlan({ db }) {
  const cards = await getAgentScorecards({ db });
  return {
    ok: true,
    version: AI_TASK_PREVIEW_VERSION,
    certificationPolicy: {
      promotionPath: ['training', 'shadow', 'assisted_review', 'certified'],
      hardRules: [
        'No delete/share/publish agent can become certified without explicit approval gates.',
        'External AI remains fallback even after certification.',
        'Agent certification can be revoked if failure rate rises or user approval drops.',
      ],
    },
    scorecards: cards.scorecards.map((card) => ({
      agentId: card.agent.id,
      agentName: card.agent.name,
      currentStatus: card.agent.status,
      readinessScore: card.scores.readinessScore,
      certificationReady: card.scores.certificationReady,
      recommendedStatus: card.scores.recommendedStatus,
      blockers: certificationBlockers(card.scores),
    })),
  };
}

function certificationBlockers(scores = {}) {
  const blockers = [];
  if ((scores.tasks || 0) < 1000) blockers.push('needs_more_shadow_tasks');
  if ((scores.userApprovalRate || 0) < 0.9) blockers.push('needs_higher_user_approval');
  if ((scores.fallbackFailureRate || 0) > 0.05) blockers.push('fallback_failure_too_high');
  if ((scores.observedConfidence || 0) < 0.92) blockers.push('confidence_too_low');
  return blockers;
}

export async function getAiAlerts({ db }) {
  const business = await getBusinessIntelligenceSnapshot({ db });
  const certification = await getCertificationPlan({ db });
  const alerts = [];

  if ((business.summary?.failureRate || 0) > 0.05) {
    alerts.push({ level: 'warning', code: 'ai_failure_rate_high', message: 'AI failure rate is above 5%. Review provider availability and routing.' });
  }
  if ((business.summary?.estimatedAiCost || 0) > 100) {
    alerts.push({ level: 'cost', code: 'ai_cost_high', message: 'AI cost is rising. Review most expensive features and economy routing.' });
  }
  certification.scorecards.forEach((card) => {
    if (card.readinessScore < 0.25) alerts.push({ level: 'learning', code: 'agent_low_readiness', agentId: card.agentId, message: `${card.agentName} needs more shadow tasks and feedback.` });
  });

  return {
    ok: true,
    version: AI_TASK_PREVIEW_VERSION,
    alerts,
    business: business.summary,
  };
}
