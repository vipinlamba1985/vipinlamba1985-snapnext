import { v4 as uuidv4 } from 'uuid';
import { previewAiTask, selectVideoProvider } from '@/lib/ai-task-preview';

export const AI_VIDEO_ADAPTER_VERSION = '6.0.0';

export const VIDEO_ADAPTER_STATUS = Object.freeze({
  PLANNING_ONLY: 'planning_only',
  READY_FOR_PROVIDER_KEY: 'ready_for_provider_key',
  DISABLED: 'disabled',
});

const PROVIDER_ENV = Object.freeze({
  veo: 'VEO_API_KEY',
  runway: 'RUNWAY_API_KEY',
  kling: 'KLING_API_KEY',
  luma: 'LUMA_API_KEY',
});

export function getVideoProviderAvailability() {
  return Object.entries(PROVIDER_ENV).map(([provider, envName]) => ({
    provider,
    configured: Boolean(process.env[envName]),
    envName,
    status: process.env[envName] ? VIDEO_ADAPTER_STATUS.READY_FOR_PROVIDER_KEY : VIDEO_ADAPTER_STATUS.PLANNING_ONLY,
  }));
}

export async function createVideoGenerationPlan({ db, user, task = '', input = {}, qualityMode = 'balanced' }) {
  const preview = await previewAiTask({ db, user, task, feature: 'videoScript', input, qualityMode });
  const provider = preview.videoProvider || selectVideoProvider({ task, input, qualityMode });
  const availability = getVideoProviderAvailability().find((item) => item.provider === provider?.id);
  const canGenerate = Boolean(availability?.configured) && preview.economy?.allowed;

  return {
    ok: true,
    id: uuidv4(),
    version: AI_VIDEO_ADAPTER_VERSION,
    provider,
    availability,
    canGenerate,
    preview,
    status: canGenerate ? 'ready_for_generation' : 'preview_only',
    message: canGenerate
      ? `Video generation can proceed with ${provider.name} after final user confirmation.`
      : `Video generation is in preview mode. Add provider keys and require final credit confirmation before execution.`,
    nextSteps: canGenerate
      ? ['Confirm credits', 'Send task to provider adapter', 'Track job status', 'Save output to SnapNext library']
      : ['Show preview to user', 'Let user choose quality mode', 'Configure video provider keys later', 'Do not charge or generate yet'],
  };
}

export async function submitVideoGenerationJob({ db, user, task = '', input = {}, qualityMode = 'balanced' }) {
  const plan = await createVideoGenerationPlan({ db, user, task, input, qualityMode });
  if (!plan.canGenerate) {
    return {
      ok: false,
      status: 402,
      error: {
        code: 'video_generation_preview_only',
        message: 'Video generation is not ready to execute yet. SnapNext can preview credits, provider, and storyboard safely.',
        plan,
      },
    };
  }

  return {
    ok: true,
    job: {
      id: uuidv4(),
      provider: plan.provider.id,
      status: 'queued_adapter_stub',
      message: 'Provider adapter is ready to be connected to the real video API. No external video call was made by this stub.',
      createdAt: new Date(),
    },
    plan,
  };
}
