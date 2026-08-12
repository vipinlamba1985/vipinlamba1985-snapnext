export const GALLERY_GRID_GAP = 4;
export const GALLERY_GROUP_GAP = 24;
export const GALLERY_HEADER_HEIGHT = 28;
export const GALLERY_OVERSCAN_PX = 900;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function galleryColumnCount(width) {
  const measured = Math.max(1, finiteNumber(width, 360));
  if (measured >= 1280) return 6;
  if (measured >= 1024) return 4;
  if (measured >= 768) return 3;
  return 2;
}

export function buildGalleryVirtualLayout(groups, width) {
  const source = Array.isArray(groups) ? groups : [];
  const measuredWidth = Math.max(1, finiteNumber(width, 360));
  const columns = galleryColumnCount(measuredWidth);
  const cardSize = Math.max(1, (measuredWidth - (GALLERY_GRID_GAP * (columns - 1))) / columns);
  const rows = [];
  let top = 0;

  for (const group of source) {
    const items = Array.isArray(group?.items) ? group.items : [];
    if (!items.length) continue;

    const groupKey = String(group?.key || `group-${rows.length}`);
    rows.push({
      key: `${groupKey}:header`,
      type: 'header',
      groupKey,
      title: String(group?.title || ''),
      count: items.length,
      top,
      height: GALLERY_HEADER_HEIGHT,
      bottom: top + GALLERY_HEADER_HEIGHT,
    });
    top += GALLERY_HEADER_HEIGHT;

    const rowCount = Math.ceil(items.length / columns);
    for (let index = 0; index < rowCount; index += 1) {
      const start = index * columns;
      const rowItems = items.slice(start, start + columns);
      rows.push({
        key: `${groupKey}:items:${index}`,
        type: 'items',
        groupKey,
        rowIndex: index,
        items: rowItems,
        top,
        height: cardSize,
        bottom: top + cardSize,
      });
      top += cardSize;
      top += index === rowCount - 1 ? GALLERY_GROUP_GAP : GALLERY_GRID_GAP;
    }
  }

  return {
    rows,
    columns,
    cardSize,
    totalHeight: Math.max(0, Math.ceil(top)),
  };
}

function firstVisibleRowIndex(rows, minimumBottom) {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].bottom < minimumBottom) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function selectGalleryVirtualRows(
  rows,
  scrollTop,
  viewportHeight,
  overscan = GALLERY_OVERSCAN_PX,
) {
  const source = Array.isArray(rows) ? rows : [];
  if (!source.length) return [];

  const top = Math.max(0, finiteNumber(scrollTop, 0));
  const height = Math.max(1, finiteNumber(viewportHeight, 800));
  const extra = Math.max(0, finiteNumber(overscan, GALLERY_OVERSCAN_PX));
  const minimum = Math.max(0, top - extra);
  const maximum = top + height + extra;
  const first = firstVisibleRowIndex(source, minimum);
  const selected = [];

  for (let index = first; index < source.length; index += 1) {
    const row = source[index];
    if (row.top > maximum) break;
    selected.push(row);
  }

  return selected;
}
