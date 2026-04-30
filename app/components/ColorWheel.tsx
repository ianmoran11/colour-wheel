"use client";

import { useRef, useEffect, useCallback } from "react";

// Maximum OKLCH chroma rendered — covers the sRGB gamut for all hues
const MAX_CHROMA = 0.37;
// Internal canvas resolution (CSS pixels, not physical)
const SIZE = 700;

export interface ColorInfo {
  l: number; // OKLCH lightness  0–1
  c: number; // OKLCH chroma     0–MAX_CHROMA
  h: number; // OKLCH hue        0–360
}

interface CellIdx {
  hi: number; // hue segment index
  vi: number; // value column index  (X axis within segment)
  ci: number; // chroma row index    (Y axis, radial)
}

interface Props {
  numHues: number;
  numValue: number;
  numChroma: number;
  onHover(color: ColorInfo | null): void;
  onSelect(color: ColorInfo): void;
}

export default function ColorWheel({
  numHues,
  numValue,
  numChroma,
  onHover,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use a ref for the hovered cell to avoid triggering React re-renders on
  // every mouse-move; we draw directly into the canvas instead.
  const hovRef = useRef<CellIdx | null>(null);

  // Derived wheel geometry in CSS-pixel space (same coord system as mouse events
  // after we apply the scale factor in hitTest).
  const layout = useCallback(() => {
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const maxR = SIZE / 2 - 8;
    const minR = maxR * 0.13; // hollow centre
    const sliceAng = (Math.PI * 2) / numHues;
    const cellAng = sliceAng / numValue;
    const radStep = (maxR - minR) / numChroma;
    // Adaptive gaps: never more than 15 % of a cell dimension
    const angGap = Math.min(0.025, cellAng * 0.15);
    const radGap = Math.min(4, radStep * 0.15);
    return { cx, cy, maxR, minR, sliceAng, cellAng, radStep, angGap, radGap };
  }, [numHues, numValue, numChroma]);

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { cx, cy, maxR, minR, sliceAng, cellAng, radStep, angGap, radGap } =
      layout();
    const hov = hovRef.current;

    ctx.clearRect(0, 0, SIZE, SIZE);

    for (let hi = 0; hi < numHues; hi++) {
      const hue = hi * (360 / numHues);

      for (let ci = 0; ci < numChroma; ci++) {
        const innerR = minR + ci * radStep + radGap / 2;
        const outerR = minR + (ci + 1) * radStep - radGap / 2;
        const chroma = ((ci + 0.5) / numChroma) * MAX_CHROMA;

        for (let vi = 0; vi < numValue; vi++) {
          // X axis = value (angular position within segment)
          const startA =
            -Math.PI / 2 + hi * sliceAng + vi * cellAng + angGap / 2;
          const endA = startA + cellAng - angGap;
          // Y axis = chroma (radial position)
          const lightness = (vi + 0.5) / numValue;

          ctx.beginPath();
          ctx.arc(cx, cy, outerR, startA, endA);
          ctx.arc(cx, cy, innerR, endA, startA, true);
          ctx.closePath();

          ctx.fillStyle = `oklch(${lightness} ${chroma} ${hue})`;
          ctx.fill();

          // Highlight the hovered cell
          if (hov && hov.hi === hi && hov.vi === vi && hov.ci === ci) {
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
        }
      }
    }

    // Dark centre disc
    ctx.beginPath();
    ctx.arc(cx, cy, minR * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
  }, [numHues, numValue, numChroma, layout]);

  // Reset hover state when parameters change so out-of-range cells aren't stuck
  useEffect(() => {
    hovRef.current = null;
    onHover(null);
  }, [numHues, numValue, numChroma, onHover]);

  // Redraw whenever the wheel parameters or hovered cell change
  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  // Convert a canvas-pixel position to cell indices, accounting for CSS scaling
  const hitTest = useCallback(
    (clientX: number, clientY: number): CellIdx | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = SIZE / rect.width;
      const sy = SIZE / rect.height;
      const x = (clientX - rect.left) * sx;
      const y = (clientY - rect.top) * sy;

      const { cx, cy, maxR, minR, sliceAng, cellAng, radStep } = layout();
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < minR || r > maxR) return null;

      // Normalise angle to [0, 2π), starting from 12 o'clock
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      if (angle >= Math.PI * 2) angle -= Math.PI * 2;

      const hi = Math.floor(angle / sliceAng);
      const vi = Math.floor((angle - hi * sliceAng) / cellAng);
      const ci = Math.floor((r - minR) / radStep);

      if (hi >= numHues || vi >= numValue || ci >= numChroma) return null;
      return { hi, vi, ci };
    },
    [layout, numHues, numValue, numChroma]
  );

  const cellToColor = useCallback(
    ({ hi, vi, ci }: CellIdx): ColorInfo => ({
      l: (vi + 0.5) / numValue,
      c: ((ci + 0.5) / numChroma) * MAX_CHROMA,
      h: hi * (360 / numHues),
    }),
    [numHues, numValue, numChroma]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const cell = hitTest(e.clientX, e.clientY);
      hovRef.current = cell;
      drawWheel();
      onHover(cell ? cellToColor(cell) : null);
    },
    [hitTest, drawWheel, cellToColor, onHover]
  );

  const handleMouseLeave = useCallback(() => {
    hovRef.current = null;
    drawWheel();
    onHover(null);
  }, [drawWheel, onHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const cell = hitTest(e.clientX, e.clientY);
      if (cell) onSelect(cellToColor(cell));
    },
    [hitTest, cellToColor, onSelect]
  );

  // Touch support
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const t = e.touches[0];
      const cell = hitTest(t.clientX, t.clientY);
      hovRef.current = cell;
      drawWheel();
      onHover(cell ? cellToColor(cell) : null);
    },
    [hitTest, drawWheel, cellToColor, onHover]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const t = e.changedTouches[0];
      const cell = hitTest(t.clientX, t.clientY);
      if (cell) onSelect(cellToColor(cell));
      hovRef.current = null;
      drawWheel();
      onHover(null);
    },
    [hitTest, drawWheel, cellToColor, onHover, onSelect]
  );

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      className="w-full h-full cursor-crosshair select-none"
      style={{ touchAction: "none" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
}
