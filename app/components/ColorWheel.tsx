"use client";

import { useRef, useEffect, useCallback } from "react";

const MAX_CHROMA = 0.37;
const SIZE = 700;
const PADDING = 24;
const INTER_GRID_GAP = 10; // px guaranteed between adjacent grid edges

export interface ColorInfo {
  l: number;
  c: number;
  h: number;
}

interface CellIdx {
  hi: number;
  vi: number; // 0 = leftmost (dark)  → numValue-1 = rightmost (light)
  ci: number; // 0 = top row (vivid)  → numChroma-1 = bottom row (grey)
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

  // Compute cell size s and ring radius R so that:
  //   • grids don't overlap: chord(adjacent centres) ≥ max(gridW, gridH) + gap
  //     chord = 2R sin(π/N)
  //   • grids fit in canvas: R + max(gridW,gridH)/2 ≤ maxR
  //
  // Solving both equalities simultaneously gives a closed form for s and R.
  const getLayout = useCallback(() => {
    const maxR = SIZE / 2 - PADDING;
    const sinPN = Math.sin(Math.PI / numHues);
    const M = Math.max(numValue, numChroma); // dominant grid dimension (cells)

    let s =
      (2 * maxR * sinPN - INTER_GRID_GAP) / (M * (1 + sinPN));

    s = Math.max(4, Math.min(44, s));

    // R from canvas-fit constraint; non-overlap is guaranteed when s equals
    // the formula above (and only slightly violated when s is clamped).
    const R = Math.max(s, maxR - (M * s) / 2);

    const cellGap = Math.max(1.5, s * 0.1);
    const cornerR = Math.min(4, s * 0.15);

    return {
      cx: SIZE / 2,
      cy: SIZE / 2,
      R,
      s,
      cellGap,
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

    const { cx, cy, R, s, cellGap, cornerR, gridW, gridH } = getLayout();
    const hov = hovRef.current;

    ctx.clearRect(0, 0, SIZE, SIZE);

    for (let hi = 0; hi < numHues; hi++) {
      const theta = hi * ((2 * Math.PI) / numHues) - Math.PI / 2;
      const hue = hi * (360 / numHues);

      // Grid centre in canvas space — NO rotation, all grids stay upright
      const gx = cx + R * Math.cos(theta);
      const gy = cy + R * Math.sin(theta);

      // Subtle background card
      const bgPad = 4;
      ctx.fillStyle = "#161616";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(
          gx - gridW / 2 - bgPad,
          gy - gridH / 2 - bgPad,
          gridW + bgPad * 2,
          gridH + bgPad * 2,
          cornerR + bgPad
        );
        ctx.fill();
      } else {
        ctx.fillRect(
          gx - gridW / 2 - bgPad,
          gy - gridH / 2 - bgPad,
          gridW + bgPad * 2,
          gridH + bgPad * 2
        );
      }

      for (let ci = 0; ci < numChroma; ci++) {
        // ci = 0 → top row → HIGH chroma (vivid at top, grey at bottom)
        const chroma = ((numChroma - ci - 0.5) / numChroma) * MAX_CHROMA;

        for (let vi = 0; vi < numValue; vi++) {
          // vi = 0 → left col → DARK (dark at left, light at right)
          const lightness = (vi + 0.5) / numValue;

          const x = gx - gridW / 2 + vi * s + cellGap / 2;
          const y = gy - gridH / 2 + ci * s + cellGap / 2;
          const w = s - cellGap;

          ctx.fillStyle = `oklch(${lightness} ${chroma} ${hue})`;
          if (cornerR > 1 && ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, w, cornerR);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, w, w);
          }

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
    }
  }, [numHues, numValue, numChroma, getLayout]);

  useEffect(() => {
    hovRef.current = null;
    onHover(null);
  }, [numHues, numValue, numChroma, onHover]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

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
        const gx = cx + R * Math.cos(theta);
        const gy = cy + R * Math.sin(theta);

        // No rotation — local coords are just the offset from grid centre
        const lx = px - gx;
        const ly = py - gy;

        if (
          lx >= -gridW / 2 &&
          lx < gridW / 2 &&
          ly >= -gridH / 2 &&
          ly < gridH / 2
        ) {
          const vi = Math.floor((lx + gridW / 2) / s);
          const ci = Math.floor((ly + gridH / 2) / s);
          if (vi >= 0 && vi < numValue && ci >= 0 && ci < numChroma)
            return { hi, vi, ci };
        }
      }
      return null;
    },
    [getLayout, numHues, numValue, numChroma]
  );

  const cellToColor = useCallback(
    ({ hi, vi, ci }: CellIdx): ColorInfo => ({
      l: (vi + 0.5) / numValue,
      c: ((numChroma - ci - 0.5) / numChroma) * MAX_CHROMA,
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
