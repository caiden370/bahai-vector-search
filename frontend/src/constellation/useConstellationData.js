/**
 * Loads the precomputed constellation assets and prepares them for WebGL.
 *
 * All three files are static build output from constellation_builder.py, so
 * this never touches the Flask backend. points.bin is three flat typed arrays
 * back to back, which means no per-point JSON parsing on a phone.
 */

import { useEffect, useState } from 'react';
import { buildPickIndex } from './pickIndex';

function hexToRgb(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Percentile extent of the point cloud, used to frame the opening view.
 * Sorting 50k Int16s is a few milliseconds and happens once per load.
 */
function coreBounds(xs, ys, count, fallback) {
  if (!count) return fallback;
  const sortedX = Int16Array.from(xs.subarray(0, count)).sort();
  const sortedY = Int16Array.from(ys.subarray(0, count)).sort();
  const at = (arr, q) => arr[Math.min(count - 1, Math.max(0, Math.round(q * (count - 1))))];

  const x0 = at(sortedX, 0.02);
  const x1 = at(sortedX, 0.98);
  const y0 = at(sortedY, 0.02);
  const y1 = at(sortedY, 0.98);

  return {
    center: [(x0 + x1) / 2, (y0 + y1) / 2],
    width: Math.max(x1 - x0, 1),
    height: Math.max(y1 - y0, 1),
  };
}

export function useConstellationData(basePath = '/constellation') {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [meta, buffer, sections] = await Promise.all([
          fetch(`${basePath}/meta.json`).then((r) => r.json()),
          fetch(`${basePath}/points.bin`).then((r) => r.arrayBuffer()),
          fetch(`${basePath}/sections.json`).then((r) => r.json()),
        ]);
        if (cancelled) return;

        const count = meta.count;
        const xs = new Int16Array(buffer, 0, count);
        const ys = new Int16Array(buffer, count * 2, count);
        const bookIds = new Uint16Array(buffer, count * 4, count);
        // Character span of this star's sentence inside its section text, so
        // the banner and reading pane can highlight the sentence rather than
        // the whole paragraph. A zero length means "no span known".
        const sentenceStarts = new Uint16Array(buffer, count * 6, count);
        const sentenceLengths = new Uint16Array(buffer, count * 8, count);

        // Interleave into the layout WebGL wants, once, up front.
        const positions = new Float32Array(count * 2);
        for (let i = 0; i < count; i += 1) {
          positions[i * 2] = xs[i];
          positions[i * 2 + 1] = ys[i];
        }

        // The builder publishes the region the bulk of the corpus occupies;
        // outliers sit clipped on the grid edge and are deliberately ignored
        // when framing the default view.
        const frame = meta.frame || [meta.extent, meta.extent];
        const bounds = {
          center: [0, 0],
          width: Math.max(frame[0] * 2, 1),
          height: Math.max(frame[1] * 2, 1),
        };

        // The frame still carries a sparse halo of stragglers. For the default
        // view we frame the dense core instead, so a tall phone screen opens on
        // the corpus rather than on empty space.
        const core = coreBounds(xs, ys, count, bounds);

        const palette = meta.authors.map((author) => hexToRgb(author.color));
        const colors = new Uint8Array(count * 3);
        const pointAuthors = new Uint8Array(count);
        for (let i = 0; i < count; i += 1) {
          const author = meta.bookAuthors[bookIds[i]] || 0;
          pointAuthors[i] = author;
          const rgb = palette[author];
          colors[i * 3] = rgb[0];
          colors[i * 3 + 1] = rgb[1];
          colors[i * 3 + 2] = rgb[2];
        }

        setData({
          meta,
          count,
          positions,
          colors,
          palette,
          pointAuthors,
          bookIds,
          sentenceStarts,
          sentenceLengths,
          sections,
          bounds,
          core,
          pick: buildPickIndex(positions, count, meta.extent),
        });
      } catch (loadError) {
        if (!cancelled) setError(loadError);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  return { data, error };
}
