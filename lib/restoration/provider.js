import { lookup } from 'dns/promises';
import { isIP } from 'net';

const MAX_OUTPUT_BYTES = Math.max(1, Number(process.env.RESTORATION_MAX_OUTPUT_MB || 25)) * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = Math.max(5_000, Number(process.env.RESTORATION_PROVIDER_TIMEOUT_MS || 120_000));
const OUTPUT_TIMEOUT_MS = Math.max(5_000, Number(process.env.RESTORATION_OUTPUT_TIMEOUT_MS || 30_000));

function finiteCost(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function providerHeaders(key) {
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function configuredOutputHosts() {
  return new Set(
    String(process.env.RESTORATION_OUTPUT_HOSTS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
      .filter(Boolean),
  );
}

function validProviderUrl() {
  try {
    const url = new URL(process.env.ENHANCE_PHOTO_PROVIDER_URL || '');
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function isRestorationProviderReady() {
  return Boolean(validProviderUrl() && configuredOutputHosts().size);
}

function isPrivateIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  const family = isIP(value);
  if (family === 4) return isPrivateIpv4(value);
  if (family === 6) {
    if (value === '::' || value === '::1' || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('::ffff:')) return isPrivateIpv4(value.slice(7));
    return false;
  }
  return true;
}

async function assertPublicHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) {
    throw Object.assign(new Error('Restoration output host is not allowed.'), { code: 'provider_output_host_blocked' });
  }
  const literalFamily = isIP(host);
  const addresses = literalFamily
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw Object.assign(new Error('Restoration output host did not resolve to a public address.'), { code: 'provider_output_host_blocked' });
  }
}

function validateOutputUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw Object.assign(new Error('The restoration provider returned an invalid output URL.'), { code: 'provider_output_invalid' });
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw Object.assign(new Error('Restoration output must use credential-free HTTPS.'), { code: 'provider_output_invalid' });
  }
  const host = url.hostname.toLowerCase();
  const allowed = configuredOutputHosts();
  if (!allowed.size || ![...allowed].some((entry) => host === entry || host.endsWith(`.${entry}`))) {
    throw Object.assign(new Error('Restoration output host is not approved.'), { code: 'provider_output_host_blocked' });
  }
  return url.toString();
}

export async function executeRestorationProvider({
  providerUrl,
  providerKey,
  jobId,
  recipe,
  sourceBuffer,
  mimeType,
}) {
  let endpoint;
  try {
    endpoint = new URL(providerUrl);
  } catch {
    throw Object.assign(new Error('The restoration provider endpoint is invalid.'), { code: 'provider_not_configured' });
  }
  if (endpoint.protocol !== 'https:') {
    throw Object.assign(new Error('The restoration provider endpoint must use HTTPS.'), { code: 'provider_not_configured' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: providerHeaders(providerKey),
      signal: controller.signal,
      redirect: 'error',
      body: JSON.stringify({
        requestId: jobId,
        action: recipe.providerAction,
        recipeId: recipe.id,
        prompt: recipe.prompt,
        imageBase64: sourceBuffer.toString('base64'),
        mimeType,
        preserveIdentity: true,
        preserveOriginal: true,
        prohibitInventedContent: true,
      }),
    });
    if (!response.ok) {
      const error = new Error(`Restoration provider returned ${response.status}.`);
      error.status = response.status;
      error.code = 'restoration_provider_failed';
      throw error;
    }
    const data = await response.json();
    const outputUrl = validateOutputUrl(data.outputUrl || data.url);
    const actualCostUsd = finiteCost(data.actualCostUsd ?? data.costUsd ?? data.usage?.costUsd);
    return {
      result: {
        outputUrl,
        providerJobId: data.jobId || data.id || null,
        providerStatus: data.status || 'completed',
        outputExpiresAt: data.outputExpiresAt || null,
      },
      provider: data.provider || 'photo_restoration',
      model: data.model || null,
      actualCostUsd,
      costBasis: actualCostUsd == null ? 'ceiling_fallback' : 'provider_reported',
      providerUsage: data.usage || null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('The restoration provider timed out.'), { code: 'ai_provider_timeout', retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadRestorationOutput(outputUrl) {
  const safeUrl = validateOutputUrl(outputUrl);
  await assertPublicHost(new URL(safeUrl).hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTPUT_TIMEOUT_MS);
  try {
    const response = await fetch(safeUrl, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw Object.assign(new Error('The restored image is no longer available.'), { code: 'restoration_output_unavailable' });
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw Object.assign(new Error('The restoration output is not a supported image.'), { code: 'restoration_output_invalid' });
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_OUTPUT_BYTES) throw Object.assign(new Error('The restored image is too large to save.'), { code: 'restoration_output_too_large' });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_OUTPUT_BYTES) {
      throw Object.assign(new Error('The restored image is too large or empty.'), { code: 'restoration_output_too_large' });
    }
    return { buffer, mimeType };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('The restored image download timed out.'), { code: 'restoration_output_timeout' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
