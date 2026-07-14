export function validateLifeGptCitations(reply, sourceCount) {
  const citations = [...String(reply || '').matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  const invalid = citations.filter((value) => value < 1 || value > sourceCount);
  return {
    citations: [...new Set(citations)],
    invalid,
    valid: sourceCount > 0 && citations.length > 0 && invalid.length === 0,
  };
}

export function averageMatchConfidence(matches) {
  if (!Array.isArray(matches) || !matches.length) return 0;
  return Math.round(matches.reduce((sum, item) => sum + Number(item?.confidence || 0), 0) / matches.length);
}

export async function recordLifeGptAudit(db, audit) {
  try {
    await db.collection('lifegpt_audits').insertOne({ ...audit, createdAt: new Date() });
  } catch (error) {
    console.error('[lifegpt] audit failed', error?.message);
  }
}
