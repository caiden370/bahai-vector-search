import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { BookText, Crosshair, Loader, Maximize2, X } from 'lucide-react';
import { createRenderer } from './renderer';
import { useConstellationData } from './useConstellationData';
import { highlightSentence } from '../highlightSentence';

// Zoom range, expressed as multiples of the "whole map fits on screen" scale.
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 40;

// A tap counts as a tap (rather than a drag) if the finger stayed within this
// many CSS pixels. Generous enough to tolerate the wobble of a real thumb.
const TAP_SLOP = 12;
const TAP_MS = 500;

// Touch targets need to be forgiving; a fingertip is far bigger than a star.
const TOUCH_PICK_RADIUS = 26;
const MOUSE_PICK_RADIUS = 14;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function ConstellationMap({ url, results, query, onContext, onOpenReader, isMobile }) {
  const { data, error } = useConstellationData();

  const canvasRef = useRef(null);
  const shellRef = useRef(null);
  const labelLayerRef = useRef(null);
  const labelRefs = useRef([]);

  const rendererRef = useRef(null);
  const cameraRef = useRef({ center: [0, 0], scale: 1, fitScale: 1, width: 1, height: 1 });
  const frameRef = useRef(0);
  const animationRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const bannerScrollRef = useRef(null);
  const bannerFocusRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [banner, setBanner] = useState(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [ready, setReady] = useState(false);
  // Set once the shell has a real measured size. Framing the search results
  // before this point would compute a scale against a 1x1 viewport.
  const [sized, setSized] = useState(false);

  const highlighted = useMemo(() => {
    if (!Array.isArray(results)) return [];
    return results.filter((item) => typeof item.PointId === 'number');
  }, [results]);

  /** Similarity-weighted centre of the hits: where the query "sits" on the map.
   *  Computed here so the server never has to project the query vector. */
  const queryPoint = useMemo(() => {
    if (!data || highlighted.length === 0) return null;
    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;
    highlighted.forEach((item) => {
      const weight = Math.max(0, Number(item.Similarity) || 0) ** 3;
      sumX += data.positions[item.PointId * 2] * weight;
      sumY += data.positions[item.PointId * 2 + 1] * weight;
      sumWeight += weight;
    });
    if (sumWeight === 0) return null;
    return [sumX / sumWeight, sumY / sumWeight];
  }, [data, highlighted]);

  // --------------------------------------------------------------------------
  // Draw layers

  const layers = useMemo(() => {
    if (!data) return null;
    const built = [];

    if (highlighted.length > 0) {
      const positions = new Float32Array(highlighted.length * 2);
      const colors = new Uint8Array(highlighted.length * 3);
      highlighted.forEach((item, i) => {
        positions[i * 2] = data.positions[item.PointId * 2];
        positions[i * 2 + 1] = data.positions[item.PointId * 2 + 1];
        const rgb = data.palette[data.pointAuthors[item.PointId]];
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      });
      built.push({ positions, colors, size: 9, alpha: 0.95, glow: 0.45, kind: 'results' });
    }

    if (queryPoint) {
      built.push({
        positions: new Float32Array(queryPoint),
        colors: new Uint8Array([255, 246, 224]),
        size: 15,
        alpha: 1,
        glow: 0.55,
        kind: 'query',
      });
    }

    if (selected) {
      const rgb = data.palette[data.pointAuthors[selected.pointId]];
      built.push({
        positions: new Float32Array([
          data.positions[selected.pointId * 2],
          data.positions[selected.pointId * 2 + 1],
        ]),
        colors: new Uint8Array(rgb),
        size: 16,
        alpha: 1,
        glow: 0.7,
        kind: 'selected',
      });
    }

    return built;
  }, [data, highlighted, queryPoint, selected]);

  const layersRef = useRef(layers);
  layersRef.current = layers;

  // --------------------------------------------------------------------------
  // Render loop

  const positionLabels = useCallback(() => {
    if (!data || !labelLayerRef.current) return;

    const camera = cameraRef.current;
    const { width, height } = camera;
    const zoom = camera.scale / camera.fitScale;

    // Reveal more landmarks as the user zooms in; at full extent only the
    // biggest regions are named, which keeps the overview readable.
    const budget = clamp(Math.round(6 + zoom * 7), 6, data.meta.topics.length);
    const placed = [];

    data.meta.topics.forEach((topic, index) => {
      const node = labelRefs.current[index];
      if (!node) return;

      const screenX = width / 2 + (topic.x - camera.center[0]) * camera.scale;
      const screenY = height / 2 - (topic.y - camera.center[1]) * camera.scale;

      let visible = placed.length < budget;
      visible =
        visible &&
        screenX > -60 &&
        screenX < width + 60 &&
        screenY > -30 &&
        screenY < height + 30;

      if (visible) {
        // Approximate the box from glyph count: measuring real widths here
        // would force a layout read every frame.
        const halfWidth = topic.text.length * 3.4 + 12;
        const box = {
          left: screenX - halfWidth,
          right: screenX + halfWidth,
          top: screenY - 12,
          bottom: screenY + 12,
        };
        // Keep labels fully on screen: a half-clipped landmark is worse than
        // none, especially on a narrow phone.
        if (box.left < 4 || box.right > width - 4) visible = false;

        if (visible) {
          const collides = placed.some(
            (other) =>
              box.left < other.right &&
              box.right > other.left &&
              box.top < other.bottom &&
              box.bottom > other.top
          );
          if (collides) visible = false;
          else placed.push(box);
        }
      }

      node.style.transform = `translate3d(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px, 0) translate(-50%, -50%)`;
      node.style.opacity = visible ? '1' : '0';
      node.style.visibility = visible ? 'visible' : 'hidden';
    });
  }, [data]);

  const render = useCallback(() => {
    frameRef.current = 0;
    const renderer = rendererRef.current;
    if (!renderer) return;

    const camera = cameraRef.current;
    const zoom = camera.scale / camera.fitScale;

    // Stars grow slowly with zoom and fade slightly when the field is dense,
    // so the map reads as a sky rather than a solid blob.
    const baseSize = clamp(1.5 * Math.pow(zoom, 0.42), 1.2, 7);
    const baseAlpha = highlighted.length > 0 ? 0.36 : clamp(0.55 + zoom * 0.02, 0.55, 0.85);

    renderer.draw(
      {
        center: camera.center,
        scale: camera.scale,
        width: camera.width,
        height: camera.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      },
      { baseSize, baseAlpha },
      layersRef.current
    );

    positionLabels();
  }, [highlighted.length, positionLabels]);

  const requestRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(render);
  }, [render]);

  useEffect(() => {
    requestRender();
  }, [layers, requestRender]);

  // --------------------------------------------------------------------------
  // Setup + resize

  useEffect(() => {
    if (!data || !canvasRef.current) return undefined;

    const renderer = createRenderer(canvasRef.current);
    if (!renderer) return undefined;

    renderer.uploadBase(data.positions, data.colors);
    rendererRef.current = renderer;
    setReady(true);

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !data) return undefined;

    const applySize = () => {
      const rect = shell.getBoundingClientRect();
      const camera = cameraRef.current;
      const first = camera.width <= 1;

      camera.width = Math.max(1, rect.width);
      camera.height = Math.max(1, rect.height);

      // Fit the real extent of the stars, with a little breathing room.
      const fit =
        Math.min(
          camera.width / data.core.width,
          camera.height / data.core.height
        ) * 0.92;
      const zoom = first ? 1 : camera.scale / camera.fitScale;
      camera.fitScale = fit;
      camera.scale = fit * zoom;
      if (first) {
        camera.center = [data.core.center[0], data.core.center[1]];
      }

      if (rect.width > 1 && rect.height > 1) setSized(true);
      requestRender();
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [data, requestRender]);

  // --------------------------------------------------------------------------
  // Camera helpers

  const screenToWorld = useCallback((clientX, clientY) => {
    const camera = cameraRef.current;
    const rect = shellRef.current.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return [
      camera.center[0] + (localX - camera.width / 2) / camera.scale,
      camera.center[1] - (localY - camera.height / 2) / camera.scale,
    ];
  }, []);

  /** Zoom about a fixed screen point, so the spot under the fingers stays put. */
  const zoomAt = useCallback(
    (factor, clientX, clientY) => {
      const camera = cameraRef.current;
      const before = screenToWorld(clientX, clientY);
      camera.scale = clamp(
        camera.scale * factor,
        camera.fitScale * MIN_ZOOM,
        camera.fitScale * MAX_ZOOM
      );
      const after = screenToWorld(clientX, clientY);
      camera.center[0] += before[0] - after[0];
      camera.center[1] += before[1] - after[1];
      requestRender();
    },
    [screenToWorld, requestRender]
  );

  const animateTo = useCallback(
    (center, scale) => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);

      const camera = cameraRef.current;
      const from = { x: camera.center[0], y: camera.center[1], scale: camera.scale };
      const to = {
        x: center[0],
        y: center[1],
        scale: clamp(scale, camera.fitScale * MIN_ZOOM, camera.fitScale * MAX_ZOOM),
      };
      const start = performance.now();
      const duration = 620;

      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.center[0] = from.x + (to.x - from.x) * eased;
        camera.center[1] = from.y + (to.y - from.y) * eased;
        // Interpolate zoom geometrically: linear interpolation of scale makes
        // long flights feel like they lurch at the end.
        camera.scale = from.scale * Math.pow(to.scale / from.scale, eased);
        render();
        if (t < 1) animationRef.current = requestAnimationFrame(step);
        else animationRef.current = null;
      };

      animationRef.current = requestAnimationFrame(step);
    },
    [render]
  );

  useEffect(
    () => () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const resetView = useCallback(() => {
    if (!data) return;
    animateTo(data.core.center, cameraRef.current.fitScale);
  }, [animateTo, data]);

  // Frame the hits whenever a new search lands, so the user is taken to the
  // part of the sky the query belongs to.
  useEffect(() => {
    if (!ready || !sized || !data || highlighted.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    highlighted.forEach((item) => {
      const x = data.positions[item.PointId * 2];
      const y = data.positions[item.PointId * 2 + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const camera = cameraRef.current;
    const padding = 2.6;
    const spanX = Math.max(maxX - minX, 400) * padding;
    const spanY = Math.max(maxY - minY, 400) * padding;
    const scale = Math.min(camera.width / spanX, camera.height / spanY);

    animateTo([(minX + maxX) / 2, (minY + maxY) / 2], scale);
  }, [ready, sized, data, highlighted, animateTo]);

  // --------------------------------------------------------------------------
  // Selection

  const openPoint = useCallback(
    async (pointId) => {
      if (!data) return;

      const book = data.meta.books[data.bookIds[pointId]];
      const section = data.sections[pointId];
      const author = data.meta.authors[data.pointAuthors[pointId]];

      setSelected({ pointId, book, section, author });
      setBannerLoading(true);
      setBanner(null);

      try {
        // Same endpoint the search results use - no new server work.
        const response = await axios.get(`${url}/getnearbytext`, {
          params: { book, section },
          headers: { 'Content-Type': 'application/json' },
        });
        const payload = response.data;

        // Recover the exact sentence this star stands for by slicing the
        // precomputed span out of its section text. Everything downstream
        // (banner and reading pane) highlights by string, so one lookup here
        // serves both.
        const sentence = sentenceAt(data, pointId, payload);

        setBanner({ ...payload, book, author, sentence });
        if (onContext) onContext(payload, sentence);
      } catch (fetchError) {
        console.error('Error fetching passage for map point:', fetchError);
        setBanner(null);
      } finally {
        setBannerLoading(false);
      }
    },
    [data, url, onContext]
  );

  const pickAt = useCallback(
    (clientX, clientY, radiusPx) => {
      if (!data) return;
      const world = screenToWorld(clientX, clientY);
      const radius = radiusPx / cameraRef.current.scale;
      const hit = data.pick.nearest(world[0], world[1], radius);
      if (hit >= 0) openPoint(hit);
    },
    [data, screenToWorld, openPoint]
  );

  // --------------------------------------------------------------------------
  // Pointer gestures: one path for mouse, pen and touch

  const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpointOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const handlePointerDown = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Capture on the canvas, not the shell: pointer capture retargets every
    // later event to the capture element, so capturing on an ancestor routes
    // pointermove/pointerup away from these handlers and strands the drag.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (ignored) {
      // Synthetic pointer ids throw here; the window-level listeners below
      // keep panning and releasing working regardless.
    }
    canvas.focus({ preventScroll: true });

    const pointers = pointersRef.current;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      moved: 0,
      type: event.pointerType,
    });

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      gestureRef.current = { distance: distanceBetween(a, b) };
    } else {
      gestureRef.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(
    (event) => {
      const pointers = pointersRef.current;
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;

      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.moved += Math.hypot(dx, dy);
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      const camera = cameraRef.current;

      if (pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const distance = distanceBetween(a, b);
        const middle = midpointOf(a, b);
        const previous = gestureRef.current;

        if (previous && previous.distance > 0 && distance > 0) {
          // Pinch and two-finger pan are applied together, which is what makes
          // the gesture feel like the map is stuck to the fingers.
          zoomAt(distance / previous.distance, middle.x, middle.y);
          if (previous.middle) {
            camera.center[0] -= (middle.x - previous.middle.x) / camera.scale;
            camera.center[1] += (middle.y - previous.middle.y) / camera.scale;
          }
        }
        gestureRef.current = { distance, middle };
        requestRender();
        return;
      }

      camera.center[0] -= dx / camera.scale;
      camera.center[1] += dy / camera.scale;
      requestRender();
    },
    [zoomAt, requestRender]
  );

  const handlePointerUp = useCallback(
    (event) => {
      const pointers = pointersRef.current;
      const pointer = pointers.get(event.pointerId);
      pointers.delete(event.pointerId);

      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      if (pointers.size < 2) gestureRef.current = null;

      if (!pointer) return;
      // Only a short, still contact counts as a tap; anything else was a pan
      // or the tail of a pinch.
      const elapsed = performance.now() - pointer.startTime;
      const drift = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
      if (pointer.moved <= TAP_SLOP && drift <= TAP_SLOP && elapsed <= TAP_MS) {
        pickAt(
          pointer.x,
          pointer.y,
          pointer.type === 'mouse' ? MOUSE_PICK_RADIUS : TOUCH_PICK_RADIUS
        );
      }
    },
    [pickAt]
  );

  // Move and release are bound to the window rather than the canvas. A drag
  // that leaves the element (or a pointer the browser never reports as up over
  // the canvas) would otherwise strand the map in a permanently-dragging state.
  useEffect(() => {
    const onMove = (event) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      handlePointerMove(event);
    };
    const onUp = (event) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      handlePointerUp(event);
    };
    const onBlur = () => {
      pointersRef.current.clear();
      gestureRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Keyboard navigation: a reliable alternative to dragging on a desktop, and
  // it makes the map usable without a pointer at all.
  const handleKeyDown = useCallback(
    (event) => {
      const camera = cameraRef.current;
      // Shift moves a screenful at a time; otherwise a comfortable nudge.
      const stepPx = event.shiftKey ? Math.min(camera.width, camera.height) * 0.8 : 90;
      const step = stepPx / camera.scale;

      let handled = true;
      switch (event.key) {
        case 'ArrowLeft':
          camera.center[0] -= step;
          break;
        case 'ArrowRight':
          camera.center[0] += step;
          break;
        case 'ArrowUp':
          camera.center[1] += step;
          break;
        case 'ArrowDown':
          camera.center[1] -= step;
          break;
        case '+':
        case '=':
          zoomAt(1.5, centerX(shellRef), centerY(shellRef));
          break;
        case '-':
        case '_':
          zoomAt(1 / 1.5, centerX(shellRef), centerY(shellRef));
          break;
        case '0':
          resetView();
          break;
        case 'Escape':
          setBanner(null);
          setSelected(null);
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
        requestRender();
      }
    },
    [zoomAt, resetView, requestRender]
  );

  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomAt(factor, event.clientX, event.clientY);
    },
    [zoomAt]
  );

  // React's onWheel is passive, so preventDefault there is ignored and the page
  // scrolls behind the map. Bind it non-passively instead.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    shell.addEventListener('wheel', handleWheel, { passive: false });
    return () => shell.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // --------------------------------------------------------------------------
  // Banner

  const closeBanner = () => {
    setBanner(null);
    setSelected(null);
  };

  // The passage arrives with several sections of surrounding context, so the
  // focused one is rarely at the top. Bring it into view once it renders.
  useEffect(() => {
    // `bannerLoading` is cleared in a separate commit from the one that sets
    // `banner`, so the scroller only exists once the loader has gone.
    if (!banner || bannerLoading) return undefined;

    let inner = 0;
    // Two frames: the first lets React commit the paragraphs, the second runs
    // after the banner's entry animation has laid them out at final size.
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const scroller = bannerScrollRef.current;
        const focus = bannerFocusRef.current;
        if (!scroller || !focus) return;

        // Sit the focused section a little below the top edge so the preceding
        // text still reads as context. Measured from rects rather than
        // offsetTop, which depends on which ancestor happens to be positioned.
        const focusRect = focus.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const offset =
          focusRect.top - scrollerRect.top + scroller.scrollTop - scroller.clientHeight * 0.25;

        // Assigned directly rather than smooth scrolled: the panel is appearing
        // at the same moment, and an animated scroll inside it looks like a glitch.
        scroller.scrollTop = Math.max(0, offset);
      });
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [banner, bannerLoading]);

  const renderBannerBody = () => {
    if (bannerLoading) {
      return (
        <div className="map-banner-loading">
          <Loader size={16} className="map-spin" />
          Loading passage...
        </div>
      );
    }
    if (!banner || !banner.response) return null;

    const { response, section_idx: sectionIdx } = banner;
    return (
      <div className="map-banner-scroll" ref={bannerScrollRef}>
        {Object.keys(response.Text || {}).map((key) => {
          const isFocus = String(response.idx[key]) === String(sectionIdx);
          return (
            <p
              key={key}
              ref={isFocus ? bannerFocusRef : null}
              className={isFocus ? 'map-banner-focus' : undefined}
            >
              {isFocus
                ? highlightSentence(response.Text[key], banner.sentence)
                : response.Text[key]}
            </p>
          );
        })}
      </div>
    );
  };

  // --------------------------------------------------------------------------

  if (error) {
    return (
      <div className="map-shell map-message">
        <p>The constellation map could not be loaded.</p>
      </div>
    );
  }

  return (
    <div className={`map-shell${banner ? ' has-banner' : ''}`} ref={shellRef}>
      <canvas
        className="map-canvas"
        ref={canvasRef}
        tabIndex={0}
        aria-label="Constellation map. Use the arrow keys to move, plus and minus to zoom."
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      />

      <div className="map-labels" ref={labelLayerRef}>
        {data &&
          data.meta.topics.map((topic, index) => (
            <span
              key={`${topic.text}-${index}`}
              className="map-label"
              ref={(node) => {
                labelRefs.current[index] = node;
              }}
            >
              {topic.text}
            </span>
          ))}
      </div>

      {!data && (
        <div className="map-message map-overlay-message">
          <Loader size={20} className="map-spin" />
          <span>Charting the sky...</span>
        </div>
      )}

      {data && (
        <div className="map-legend">
          {data.meta.authors.map((author) => (
            <div className="map-legend-row" key={author.name}>
              <span className="map-legend-dot" style={{ background: author.color }} />
              {author.name}
            </div>
          ))}
        </div>
      )}

      <div className="map-controls">
        <button type="button" onClick={() => zoomAt(1.6, centerX(shellRef), centerY(shellRef))}>
          +
        </button>
        <button type="button" onClick={() => zoomAt(1 / 1.6, centerX(shellRef), centerY(shellRef))}>
          −
        </button>
        <button type="button" onClick={resetView} title="Reset view">
          <Maximize2 size={15} />
        </button>
        {queryPoint && (
          <button
            type="button"
            title="Go to query"
            onClick={() => animateTo(queryPoint, cameraRef.current.fitScale * 4)}
          >
            <Crosshair size={15} />
          </button>
        )}
      </div>

      {query && highlighted.length > 0 && (
        <div className="map-query-chip">
          <span className="map-query-star">✦</span>
          {query}
          <span className="map-query-count">{highlighted.length} matches</span>
        </div>
      )}

      {(selected || bannerLoading) && (
        <div className={`map-banner ${isMobile ? 'map-banner-mobile' : ''}`}>
          <div className="map-banner-head">
            <div className="map-banner-titles">
              <div className="map-banner-book">
                <BookText size={14} />
                {selected ? selected.book : ''}
              </div>
              {selected && (
                <div className="map-banner-author" style={{ color: selected.author.color }}>
                  {selected.author.name}
                </div>
              )}
            </div>
            <div className="map-banner-actions">
              {banner && onOpenReader && (
                <button type="button" className="map-banner-read" onClick={onOpenReader}>
                  Read in full
                </button>
              )}
              <button type="button" className="map-banner-close" onClick={closeBanner}>
                <X size={16} />
              </button>
            </div>
          </div>
          {renderBannerBody()}
        </div>
      )}
    </div>
  );
}

/**
 * The sentence a star represents, sliced out of the section text the backend
 * just returned using the span precomputed by constellation_builder.py.
 */
function sentenceAt(data, pointId, payload) {
  const length = data.sentenceLengths ? data.sentenceLengths[pointId] : 0;
  if (!length || !payload || !payload.response) return null;

  const { response, section_idx: sectionIdx } = payload;
  const key = Object.keys(response.Text || {}).find(
    (k) => String(response.idx[k]) === String(sectionIdx)
  );
  if (key === undefined) return null;

  const text = response.Text[key];
  const start = data.sentenceStarts[pointId];
  if (typeof text !== 'string' || start + length > text.length) return null;

  return text.slice(start, start + length);
}

function centerX(ref) {
  const rect = ref.current.getBoundingClientRect();
  return rect.left + rect.width / 2;
}

function centerY(ref) {
  const rect = ref.current.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

export default ConstellationMap;
