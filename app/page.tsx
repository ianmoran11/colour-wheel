"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ColorWheel, { type ColorInfo } from "./components/ColorWheel";

// ─── colour utilities ────────────────────────────────────────────────────────

function oklchToHex(l: number, c: number, h: number): string {
  if (typeof document === "undefined") return "#000000";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `oklch(${l} ${c} ${h})`;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function fmt(n: number, decimals = 3) {
  return n.toFixed(decimals);
}

// ─── types ────────────────────────────────────────────────────────────────────

interface PaletteEntry extends ColorInfo {
  hex: string;
  id: number;
}

let _id = 0;

// ─── sub-components ──────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm text-neutral-400">{label}</span>
        <span className="text-sm font-mono text-white">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="text-xs px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors font-mono"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function ColorInfoPanel({ color }: { color: ColorInfo }) {
  const [hex, setHex] = useState("#000000");

  useEffect(() => {
    setHex(oklchToHex(color.l, color.c, color.h));
  }, [color.l, color.c, color.h]);

  const cssString = `oklch(${fmt(color.l * 100, 1)}% ${fmt(color.c)} ${fmt(color.h, 1)})`;

  return (
    <div>
      {/* Swatch */}
      <div
        className="w-full h-24 rounded-xl mb-4 border border-white/10 shadow-inner"
        style={{ backgroundColor: cssString }}
      />

      {/* Values */}
      <div className="space-y-2 text-sm font-mono mb-3">
        {(
          [
            ["L", `${fmt(color.l * 100, 1)}%`],
            ["C", fmt(color.c, 4)],
            ["H", `${fmt(color.h, 1)}°`],
            ["HEX", hex],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between items-center gap-2">
            <span className="text-neutral-500 w-8">{k}</span>
            <span className="text-neutral-200 flex-1 truncate">{v}</span>
            <CopyButton text={v} />
          </div>
        ))}
      </div>

      {/* Full CSS string */}
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-neutral-500 truncate">
          {cssString}
        </code>
        <CopyButton text={cssString} />
      </div>
    </div>
  );
}

function PaletteSwatch({
  entry,
  onRemove,
}: {
  entry: PaletteEntry;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        title={entry.hex}
        onClick={onRemove}
        className="w-10 h-10 rounded-lg border border-white/10 transition-transform hover:scale-110"
        style={{ backgroundColor: entry.hex }}
      />
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs font-mono text-neutral-200 whitespace-nowrap pointer-events-none z-10">
          {entry.hex}
          <br />
          <span className="text-neutral-500">click to remove</span>
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [numHues, setNumHues] = useState(12);
  const [numValue, setNumValue] = useState(7);
  const [numChroma, setNumChroma] = useState(6);
  const [hovered, setHovered] = useState<ColorInfo | null>(null);
  const [palette, setPalette] = useState<PaletteEntry[]>([]);

  // Stable callback refs so ColorWheel memoisation isn't broken by re-renders
  const handleHover = useCallback((c: ColorInfo | null) => setHovered(c), []);

  const handleSelect = useCallback((color: ColorInfo) => {
    setPalette((prev) => {
      const dupe = prev.some(
        (p) =>
          Math.abs(p.l - color.l) < 0.005 &&
          Math.abs(p.c - color.c) < 0.005 &&
          Math.abs(p.h - color.h) < 0.5
      );
      if (dupe) return prev;
      const hex = oklchToHex(color.l, color.c, color.h);
      return [...prev, { ...color, hex, id: _id++ }];
    });
  }, []);

  const removeFromPalette = useCallback(
    (id: number) => setPalette((p) => p.filter((c) => c.id !== id)),
    []
  );

  const copyPalette = useCallback(() => {
    const css = palette
      .map(
        (c, i) =>
          `  --color-${i + 1}: oklch(${fmt(c.l * 100, 1)}% ${fmt(c.c)} ${fmt(c.h, 1)});`
      )
      .join("\n");
    navigator.clipboard.writeText(`:root {\n${css}\n}`).catch(() => {});
  }, [palette]);

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "#0a0a0a" }}>
      {/* ── header ── */}
      <header
        className="px-6 py-4 flex items-baseline gap-3"
        style={{ borderBottom: "1px solid #1a1a1a" }}
      >
        <h1 className="text-lg font-semibold tracking-tight text-white">
          Colour Wheel
        </h1>
        <p className="text-sm" style={{ color: "#555" }}>
          OKLCH · hover to inspect · click to collect
        </p>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* ── wheel ── */}
        <div className="flex-1 flex items-center justify-center p-6 min-h-0">
          <div
            className="w-full max-w-[600px]"
            style={{ aspectRatio: "1" }}
          >
            <ColorWheel
              numHues={numHues}
              numValue={numValue}
              numChroma={numChroma}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          </div>
        </div>

        {/* ── sidebar ── */}
        <aside
          className="w-full lg:w-72 flex flex-col overflow-y-auto"
          style={{ borderLeft: "1px solid #1a1a1a" }}
        >
          {/* Controls */}
          <section className="p-5" style={{ borderBottom: "1px solid #1a1a1a" }}>
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-5"
              style={{ color: "#555" }}
            >
              Controls
            </h2>
            <Slider
              label="Hues"
              value={numHues}
              min={3}
              max={48}
              onChange={setNumHues}
            />
            <Slider
              label="Value steps  (X)"
              value={numValue}
              min={1}
              max={12}
              onChange={setNumValue}
            />
            <Slider
              label="Chroma steps  (Y)"
              value={numChroma}
              min={1}
              max={10}
              onChange={setNumChroma}
            />

            {/* Legend */}
            <div
              className="mt-4 rounded-lg p-3 text-xs space-y-1.5"
              style={{ background: "#141414", color: "#555" }}
            >
              <div className="flex gap-2">
                <span className="text-neutral-400 font-medium">X axis</span>
                <span>Value (lightness) — dark → light across each segment</span>
              </div>
              <div className="flex gap-2">
                <span className="text-neutral-400 font-medium">Y axis</span>
                <span>Chroma (saturation) — grey → vivid outward from centre</span>
              </div>
            </div>
          </section>

          {/* Colour info */}
          <section className="p-5" style={{ borderBottom: "1px solid #1a1a1a" }}>
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: "#555" }}
            >
              {hovered ? "Colour" : "Hover to inspect"}
            </h2>
            {hovered ? (
              <ColorInfoPanel color={hovered} />
            ) : (
              <div
                className="w-full h-24 rounded-xl border flex items-center justify-center text-sm"
                style={{
                  borderColor: "#1f1f1f",
                  background: "#111",
                  color: "#444",
                }}
              >
                no colour selected
              </div>
            )}
          </section>

          {/* Palette */}
          <section className="p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "#555" }}
              >
                Palette{palette.length > 0 && ` · ${palette.length}`}
              </h2>
              {palette.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={copyPalette}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{
                      background: "#1a1a1a",
                      color: "#777",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#ccc";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#777";
                    }}
                  >
                    copy CSS vars
                  </button>
                  <button
                    onClick={() => setPalette([])}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{
                      background: "#1a1a1a",
                      color: "#777",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#ccc";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#777";
                    }}
                  >
                    clear
                  </button>
                </div>
              )}
            </div>

            {palette.length === 0 ? (
              <p className="text-sm" style={{ color: "#3a3a3a" }}>
                Click colours on the wheel to collect them here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {palette.map((entry) => (
                  <PaletteSwatch
                    key={entry.id}
                    entry={entry}
                    onRemove={() => removeFromPalette(entry.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
