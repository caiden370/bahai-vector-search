/**
 * Uniform-grid spatial index over the projected points.
 *
 * A tap has to resolve against ~52k stars while the user's finger is still on
 * the glass, so a linear scan is out. This builds a CSR-style bucket grid once
 * at load (three typed arrays, no per-point objects) and searches outward ring
 * by ring, stopping as soon as no closer hit is possible.
 */

const GRID = 128;

export function buildPickIndex(positions, count, extent) {
  const min = -extent;
  const span = extent * 2;
  const cell = span / GRID;

  const cellOf = (value) => {
    const index = Math.floor((value - min) / cell);
    return index < 0 ? 0 : index >= GRID ? GRID - 1 : index;
  };

  // Counting sort into buckets: tally, prefix-sum, then scatter.
  const counts = new Int32Array(GRID * GRID);
  for (let i = 0; i < count; i += 1) {
    const cx = cellOf(positions[i * 2]);
    const cy = cellOf(positions[i * 2 + 1]);
    counts[cy * GRID + cx] += 1;
  }

  const starts = new Int32Array(GRID * GRID + 1);
  for (let i = 0; i < GRID * GRID; i += 1) {
    starts[i + 1] = starts[i] + counts[i];
  }

  const cursor = starts.slice(0, GRID * GRID);
  const items = new Int32Array(count);
  for (let i = 0; i < count; i += 1) {
    const cx = cellOf(positions[i * 2]);
    const cy = cellOf(positions[i * 2 + 1]);
    const bucket = cy * GRID + cx;
    items[cursor[bucket]] = i;
    cursor[bucket] += 1;
  }

  /**
   * Nearest point to (x, y) in world units, or -1 if nothing is within
   * maxDistance. Searches expanding square rings around the tap.
   */
  function nearest(x, y, maxDistance) {
    const originX = cellOf(x);
    const originY = cellOf(y);
    const maxRing = Math.min(GRID, Math.ceil(maxDistance / cell) + 1);

    let best = -1;
    let bestDistance = maxDistance * maxDistance;

    for (let ring = 0; ring <= maxRing; ring += 1) {
      // Once the closest possible point in this ring is farther than the best
      // hit so far, no later ring can improve on it.
      if (best !== -1 && (ring - 1) * cell > Math.sqrt(bestDistance)) break;

      const loX = originX - ring;
      const hiX = originX + ring;
      const loY = originY - ring;
      const hiY = originY + ring;

      for (let cy = loY; cy <= hiY; cy += 1) {
        if (cy < 0 || cy >= GRID) continue;
        const edgeRow = cy === loY || cy === hiY;

        for (let cx = loX; cx <= hiX; cx += 1) {
          if (cx < 0 || cx >= GRID) continue;
          // Interior cells were covered by a previous, smaller ring.
          if (!edgeRow && cx !== loX && cx !== hiX) continue;

          const bucket = cy * GRID + cx;
          for (let s = starts[bucket]; s < starts[bucket + 1]; s += 1) {
            const index = items[s];
            const dx = positions[index * 2] - x;
            const dy = positions[index * 2 + 1] - y;
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
              bestDistance = distance;
              best = index;
            }
          }
        }
      }
    }

    return best;
  }

  return { nearest };
}
