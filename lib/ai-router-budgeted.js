import * as legacy from './ai-router.js';
import * as gatewayV2 from './ai-router-v2.js';

// All production imports of `@/lib/ai-router` resolve to this compatibility
// module through jsconfig.json. Gateway v2 is the default. Set
// AI_GATEWAY_V2_ENABLED=false for a one-release emergency rollback.
function useGatewayV2() {
  return String(process.env.AI_GATEWAY_V2_ENABLED || 'true').toLowerCase() !== 'false';
}

export const AI_FEATURES = gatewayV2.AI_FEATURES;
export const AI_PLAN_LIMITS = gatewayV2.AI_PLAN_LIMITS;
export const aiFeatureCost = gatewayV2.aiFeatureCost;
export const getAiEntitlement = gatewayV2.getAiEntitlement;
export const preflightAiRequest = gatewayV2.preflightAiRequest;

export async function runAiTask(args) {
  return useGatewayV2()
    ? gatewayV2.runAiTask(args)
    : legacy.runAiTask(args);
}

export async function getAiUsageSummary(args) {
  return useGatewayV2()
    ? gatewayV2.getAiUsageSummary(args)
    : legacy.getAiUsageSummary(args);
}
