function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function center(box = {}) {
  const left = finite(box.Left ?? box.left);
  const top = finite(box.Top ?? box.top);
  const width = finite(box.Width ?? box.width);
  const height = finite(box.Height ?? box.height);
  return {
    x: left + width / 2,
    y: top + height / 2,
    width,
    height,
  };
}

export function faceBoxDistance(a = {}, b = {}) {
  const first = center(a);
  const second = center(b);
  const centerDistance = Math.hypot(first.x - second.x, first.y - second.y);
  const sizeDistance = Math.abs(first.width - second.width) + Math.abs(first.height - second.height);
  return centerDistance + sizeDistance * 0.25;
}

export function closestFaceIndex(rows = [], targetBox = {}) {
  const usable = (Array.isArray(rows) ? rows : []).filter((row) => row?.clusterId && row?.boundingBox);
  if (!usable.length) return null;
  return usable
    .map((row) => ({ row, distance: faceBoxDistance(row.boundingBox, targetBox) }))
    .sort((a, b) => a.distance - b.distance)[0]?.row || null;
}

export function replaceActiveCluster(values = [], previousClusterId = '', nextClusterId = '') {
  const previous = String(previousClusterId || '').trim();
  const next = String(nextClusterId || '').trim();
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const current = String(value || '').trim();
    if (!current) continue;
    const resolved = previous && current === previous ? next : current;
    if (resolved && !output.includes(resolved)) output.push(resolved);
  }
  if (next && previous && !output.includes(next) && values?.includes?.(previous)) output.push(next);
  return output;
}
