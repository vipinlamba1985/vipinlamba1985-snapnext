'use client';

import { useEffect } from 'react';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_HEX = /\b[0-9a-f]{24,64}\b/gi;
const REQUEST_LABEL = /\b(request|job|trace|correlation|session)[ _-]?(id|code)\s*[:#-]?\s*[a-z0-9_-]{8,}\b/gi;
const HTTP_ERROR = /\b(?:HTTP\s*)?(?:400|401|403|404|408|409|413|415|422|429|500|502|503|504)\b/g;

const FRIENDLY_REPLACEMENTS = [
  [/\binternal server error\b/gi, 'Something did not go as planned'],
  [/\brequest failed\b/gi, 'We could not finish that'],
  [/\bunauthorized\b/gi, 'Please sign in again'],
  [/\bforbidden\b/gi, 'This option is not available for your account'],
  [/\brate limit(?:ed)?\b/gi, 'Please give us a moment before trying again'],
  [/\bquota exceeded\b/gi, 'You have used your available creations for now'],
  [/\bprovider(?: not configured| unavailable| error)?\b/gi, 'creation service'],
  [/\bjob queued\b/gi, 'Your creation is waiting to begin'],
  [/\bprocessing job\b/gi, 'Creating your result'],
  [/\blatency\b/gi, 'response time'],
  [/\binference\b/gi, 'creation'],
  [/\bAPI\b/g, 'SnapNext'],
  [/\bMongoDB\b/gi, 'secure storage'],
  [/\bRedis\b/gi, 'SnapNext'],
  [/\bAmazon S3\b|\bAWS S3\b|\bS3 bucket\b/gi, 'secure cloud storage'],
  [/\bOpenAI\b|\bGemini\b|\bAnthropic\b|\bReplicate\b|\bfal\.ai\b/gi, 'SnapNext AI'],
];

function makeFriendly(value) {
  let text = String(value || '');
  text = text.replace(REQUEST_LABEL, 'reference details');
  text = text.replace(UUID, 'private reference');
  text = text.replace(LONG_HEX, 'private reference');
  text = text.replace(HTTP_ERROR, '');
  for (const [pattern, replacement] of FRIENDLY_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

function shouldSkip(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest('code, pre, script, style, [data-allow-technical-copy="true"]')) return true;
  if (parent.closest('[data-admin-surface="true"]')) return true;
  return false;
}

function cleanNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (shouldSkip(node) || !node.nodeValue?.trim()) return;
    const next = makeFriendly(node.nodeValue);
    if (next && next !== node.nodeValue.trim()) node.nodeValue = next;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node;
  if (element.matches('input, textarea')) {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) element.setAttribute('placeholder', makeFriendly(placeholder));
  }
  const title = element.getAttribute?.('title');
  if (title) element.setAttribute('title', makeFriendly(title));
  const label = element.getAttribute?.('aria-label');
  if (label) element.setAttribute('aria-label', makeFriendly(label));

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let current;
  while ((current = walker.nextNode())) cleanNode(current);
}

export default function FriendlyCopyGuard({ disabled = false }) {
  useEffect(() => {
    if (disabled || typeof document === 'undefined') return;
    const root = document.querySelector('main') || document.body;
    cleanNode(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') cleanNode(mutation.target);
        for (const node of mutation.addedNodes) cleanNode(node);
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [disabled]);

  return null;
}
