"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Minimal canvas-based signature pad. Pointer events for desktop +
 * touch + Apple Pencil. Outputs a base64 PNG ready to drop into the
 * answers JSON. Kept dependency-free — about 90 lines vs pulling in
 * the signature_pad package.
 */
export function SignaturePad({
  value,
  onChange,
  ariaLabel,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState<boolean>(!!value);

  // Re-load any persisted base64 on mount or when `value` changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    if (!value) return;
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    };
    img.src = value;
  }, [value]);

  // Resize the canvas backing buffer to match its CSS pixel size for
  // crisp strokes on hi-DPI screens.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3E3E31";
  }, []);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): {
    x: number;
    y: number;
  } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function commit(): void {
    const c = canvasRef.current;
    if (!c) return;
    onChange(c.toDataURL("image/png"));
  }

  function clear(): void {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasStrokes(false);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className="h-44 w-full touch-none rounded-lg border border-olive/15 bg-cream"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drawing.current = true;
          lastPoint.current = pointFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = canvasRef.current;
          if (!c) return;
          const ctx = c.getContext("2d");
          if (!ctx) return;
          const p = pointFromEvent(e);
          const last = lastPoint.current ?? p;
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          lastPoint.current = p;
          setHasStrokes(true);
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          lastPoint.current = null;
          commit();
        }}
        onPointerCancel={() => {
          drawing.current = false;
          lastPoint.current = null;
        }}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracking-snug text-olive-soft">
          Sign with your finger or stylus.
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={!hasStrokes}
          className="rounded-full px-3 py-1 text-[12px] tracking-snug text-olive-soft hover:bg-sage/5 hover:text-olive disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
