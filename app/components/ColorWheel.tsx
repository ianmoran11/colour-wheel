"use client";

import { useRef, useEffect, useCallback } from "react";

const MAX_CHROMA = 0.37;
const SIZE = 700;
const PADDING = 24;

export interface ColorInfo {
  l: number; // OKLCH lightness  0–1
  c: number; // OKLCH chroma     0–MAX_CHROMA
  h: number; // OKLCH hue        0–360
}

interface CellIdx {
  hi: number; // hue grid index
  vi: number; // value column  (X axis — tangential)
  ci: number; // chroma row    (Y axis — radial outward)
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
  const hovRef = useRef<CellIdx | null>(null);

  // Compute the geometry that makes every grid fit inside the canvas without
  // overlap. We solve for the cell size s and ring radius R simultaneously:
  //
  //   Tangential fit:  numValue * s * (1 + gapFrac) = 2π R / numHues
  //   Radial fit:      R + numChroma * s / 2 = maxR
  //
  // Eliminating R gives a closed-form for s.
  const getLayout = useCallback(() => {
    const maxR = SIZE / 2 - PADDING;
    const gapFrac = 0.15; // inter-cell gap as fraction of cellSize

    let s =
      maxR /
      (numChroma / 2 +
        (numHues * numValue * (1 + gapFrac)) / (2 * Math.PI));

    // Clamp to keep cells legible at extreme slider values
    s = Math.max(4, Math.min(44, s));

    let R = (numHues * numValue * s * (1 + gapFrac)) / (2 * Math.PI);

    // Safety: if outer edge overshoots (due to clamping), scale both down
    const outerEdge = R + (numChroma * s) / 2;
    if (outerEdge > maxR) {
      const scale = maxR / outerEdge;
      s *= scale;
      R *= scale;
    }

    const gap = Math.max(1.5, s * 0.1);
    const cornerR = Math.min(4, s * 0.18);

    return {
      cx: SIZE / 2,
      cy: SIZE / 2,
      R,
      s,          // cell size (includes gap border)
      gap,
      cornerR,
      gridW: numValue * s,
      gridH: numChroma * s,
    };
  }, [numHues, numValue, numChroma]);

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { cx, cy, R, s, gap, cornerR, gridW, gridH } = getLayout();
    const hov = hovRef.current;

    ctx.clearRect(0, 0, SIZE, SIZE);

    for (let hi = 0; hi < numHues; hi++) {
      // θ = angle from centre to this grid's midpoint (12 o'clock = 0)
      const theta = hi * ((2 * Math.PI) / numHues) - Math.PI / 2;
      const hue = hi * (360 / numHues);

      ctx.save();
      // Place origin at the grid centre on the ring
      ctx.translate(cx + R * Math.cos(theta), cy + R * Math.sin(theta));
      // Rotate so local +Y points radially outward and local +X is tangential.
      // ctx.rotate(θ) maps local (1,0) → (cos θ, sin θ) and local (0,1) →
      // (-sin θ, cos θ).  We want local (0,1) = radial outward = (cos θ, sin θ),
      // which requires rotation angle (θ − π/2).
      ctx.rotate(theta - Math.PI / 2);

      // Subtle grid background
      const bgPad = 4;
      ctx.fillStyle = "#161616";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(
          -gridW / 2 - bgPad,
          -gridH / 2 - bgPad,
          gridW + bgPad * 2,
          gridH + bgPad * 2,
          cornerR + bgPad
        );
        ctx.fill();
      }

      for (let ci = 0; ci < numChroma; ci++) {
        // ci = 0 → inner edge (low chroma), ci = numChroma-1 → outer edge (high chroma)
        const chroma = ((ci + 0.5) / numChroma) * MAX_CHROMA;

        for (let vi = 0; vi < numValue; vi++) {
          const lightness = (vi + 0.5) / numValue;

          const x = -gridW / 2 + vi * s + gap / 2;
          const y = -gridH / 2 + ci * s + gap / 2;
          const w = s - gap;

          ctx.fillStyle = `oklch(${lightness} ${chroma} ${hue})`;

          if (cornerR > 1 && ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, w, cornerR);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, w, w);
          }

          // Hover highlight
          if (hov && hov.hi === hi && hov.vi === vi && hov.ci === ci) {
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            if (cornerR > 1 && ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(x, y, w, w, cornerR);
              ctx.stroke();
            } else {
              ctx.strokeRect(x, y, w, w);
            }
          }
        }
      }

      ctx.restore();
    }
  }, [numHues, numValue, numChroma, getLayout]);

  // Reset hover when parameters change (avoids stale cell indices)
  useEffect(() => {
    hovRef.current = null;
    onHover(null);
  }, [numHues, numValue, numChroma, onHover]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  // Map a pointer position to a cell index.
  // For each grid we apply the inverse of its canvas transform:
  //   1. Subtract grid-centre world position
  //   2. Inverse-rotate by (θ − π/2)
  // The inverse rotation of angle α is: lx = dx·cos α + dy·sin α,
  //                                       ly = −dx·sin α + dy·cos α
  const hitTest = useCallback(
    (clientX: number, clientY: number): CellIdx | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * (SIZE / rect.width);
      const py = (clientY - rect.top) * (SIZE / rect.height);

      const { cx, cy, R, s, gridW, gridH } = getLayout();

      for (let hi = 0; hi < numHues; hi++) {
        const theta = hi * ((2 * Math.PI) / numHues) - Math.PI / 2;
        const dx = px - (cx + R * Math.cos(theta));
        const dy = py - (cy + R * Math.sin(theta));

        // Inverse rotate by (theta − π/2)
        const alpha = theta - Math.PI / 2;
        const lx = dx * Math.cos(alpha) + dy * Math.sin(alpha);
        const ly = -dx * Math.sin(alpha) + dy * Math.cos(alpha);

        if (
          lx >= -gridW / 2 &&
          lx < gridW / 2 &&
          ly >= -gridH / 2 &&
          ly < gridH / 2
        ) {
          const vi = Math.floor((lx + gridW / 2) / s);
          const ci = Math.floor((ly + gridH / 2) / s);
          if (vi >= 0 && vi < numValue && ci >= 0 && ci < numChroma) {
            return { hi, vi, ci };
          }
        }
      }
      return null;
    },
    [getLayout, numHues, numValue, numChroma]
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
