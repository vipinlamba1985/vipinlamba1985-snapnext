'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildGalleryVirtualLayout,
  selectGalleryVirtualRows,
} from '@/lib/gallery-virtualization';

function sameMetrics(a, b) {
  return a.width === b.width && a.scrollTop === b.scrollTop && a.viewportHeight === b.viewportHeight;
}

export default function VirtualizedDayGrid({ groups, renderItem }) {
  const rootRef = useRef(null);
  const frameRef = useRef(0);
  const [metrics, setMetrics] = useState({ width: 360, scrollTop: 0, viewportHeight: 800 });

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof window === 'undefined') return undefined;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const rootTop = window.scrollY + rect.top;
      const next = {
        width: Math.max(1, rect.width || 360),
        scrollTop: Math.max(0, window.scrollY - rootTop),
        viewportHeight: Math.max(1, window.innerHeight || 800),
      };
      setMetrics(current => sameMetrics(current, next) ? current : next);
    };

    const scheduleMeasure = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        measure();
      });
    };

    measure();
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
    observer?.observe(node);

    return () => {
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      observer?.disconnect();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, []);

  const layout = useMemo(
    () => buildGalleryVirtualLayout(groups, metrics.width),
    [groups, metrics.width],
  );
  const visibleRows = useMemo(
    () => selectGalleryVirtualRows(layout.rows, metrics.scrollTop, metrics.viewportHeight),
    [layout.rows, metrics.scrollTop, metrics.viewportHeight],
  );

  return (
    <div
      ref={rootRef}
      data-testid="library-virtual-grid"
      data-virtual-row-count={layout.rows.length}
      data-rendered-row-count={visibleRows.length}
      aria-label="Memory library"
      className="relative w-full"
      style={{ height: `${layout.totalHeight}px` }}
    >
      {visibleRows.map(row => {
        if (row.type === 'header') {
          return (
            <div
              key={row.key}
              data-testid={`library-day-${row.groupKey}`}
              className="absolute left-0 right-0 flex items-start"
              style={{ top: `${row.top}px`, height: `${row.height}px` }}
            >
              <h2 className="text-sm font-black text-white/70">
                {row.title}
                <span className="ml-2 text-xs font-bold text-white/30">{row.count}</span>
              </h2>
            </div>
          );
        }

        return (
          <div
            key={row.key}
            data-testid={`library-virtual-row-${row.groupKey}-${row.rowIndex}`}
            className="absolute left-0 right-0 grid"
            style={{
              top: `${row.top}px`,
              height: `${row.height}px`,
              gap: '4px',
              gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
            }}
          >
            {row.items.map(item => renderItem(item))}
          </div>
        );
      })}
    </div>
  );
}
