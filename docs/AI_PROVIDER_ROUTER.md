# SnapNext Multi-AI Provider Router

SnapNext already has a production AI entitlement and usage layer in `lib/ai-router.js`. The companion `lib/ai-provider-router.js` adds optional low-cost provider routing for text and agent workloads while preserving Gemini for vision.

## Intended routing

- Vision and media understanding: Gemini.
- Fast text, chat and agent commands: Groq first, then Gemini.
- Broad fallback routing: OpenRouter.
- Experimental open-source fallback: Hugging Face.
- Existing OpenAI integration remains available in the current production router.

## Safety rules

API keys are server-side only. Do not prefix provider keys with `NEXT_PUBLIC_`. Do not send private media or memory context to a provider unless the user is authenticated and the existing entitlement, ownership and permission checks have passed. External publishing and sharing actions require explicit user confirmation.

## Integration sequence

1. Configure provider keys in the deployment environment.
2. Keep existing `preflightAiRequest`, quotas, plan entitlements, usage logging and history storage as the source of truth.
3. Introduce the provider router behind selected low-risk text features first.
4. Add timeout, retry and circuit-breaker telemetry before increasing traffic.
5. Keep Gemini-only routing for image/video understanding until each alternate provider is explicitly validated for the media task.
6. Record provider, model, latency, estimated cost, failure reason and fallback count for every request.

## Production note

Free tiers and free model availability can change. Routing must be based on configured providers and measured reliability, not an assumption that any provider will remain free permanently.
