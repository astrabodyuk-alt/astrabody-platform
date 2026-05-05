"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantModal } from "./AssistantModal";

const BUBBLE = 56;
const MARGIN = 12;
const DRAG_THRESHOLD = 8; // px before we consider it a drag vs tap

export function AssistantBubble({ hasUnread = false }: { hasUnread?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Use a ref for drag state so we don't re-render during drag
  const drag = useRef<{
    startTouchX: number;
    startTouchY: number;
    startBubbleX: number;
    startBubbleY: number;
    moved: boolean;
  } | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Use touch events directly — more reliable than pointer events on iOS Safari
  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const rect = btn!.getBoundingClientRect();
      drag.current = {
        startTouchX: t.clientX,
        startTouchY: t.clientY,
        startBubbleX: rect.left,
        startBubbleY: rect.top,
        moved: false,
      };
    }

    function onTouchMove(e: TouchEvent) {
      if (!drag.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - drag.current.startTouchX;
      const dy = t.clientY - drag.current.startTouchY;
      if (!drag.current.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.current.moved = true;
      // Prevent page scroll while dragging the bubble
      e.preventDefault();
      const newX = Math.max(MARGIN, Math.min(window.innerWidth - BUBBLE - MARGIN, drag.current.startBubbleX + dx));
      const newY = Math.max(MARGIN, Math.min(window.innerHeight - BUBBLE - MARGIN, drag.current.startBubbleY + dy));
      // Update position via direct style for zero-lag during drag
      btn!.style.left = `${newX}px`;
      btn!.style.top = `${newY}px`;
      btn!.style.right = "auto";
      btn!.style.bottom = "auto";
    }

    function onTouchEnd() {
      if (!drag.current) return;
      if (!drag.current.moved) {
        setOpen(true);
      } else {
        // Commit final position to React state
        const rect = btn!.getBoundingClientRect();
        setPos({ x: rect.left, y: rect.top });
      }
      drag.current = null;
    }

    btn.addEventListener("touchstart", onTouchStart, { passive: true });
    btn.addEventListener("touchmove", onTouchMove, { passive: false });
    btn.addEventListener("touchend", onTouchEnd);
    return () => {
      btn.removeEventListener("touchstart", onTouchStart);
      btn.removeEventListener("touchmove", onTouchMove);
      btn.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const bubbleStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: "20px", bottom: "calc(env(safe-area-inset-bottom, 0px) + 116px)" };

  return (
    <>
      <style>{BUBBLE_CSS}</style>
      <button
        ref={btnRef}
        type="button"
        aria-label="Open Astrabody assistant"
        onClick={() => { if (!drag.current?.moved) setOpen(true); }}
        className="astra-bubble"
        data-pulse={pulse ? "1" : "0"}
        style={bubbleStyle}
      >
        <span className="astra-bubble__glow" aria-hidden />
        <span className="astra-bubble__icon" aria-hidden>✦</span>
        {hasUnread && <span className="astra-bubble__badge" aria-hidden />}
      </button>

      {open && <AssistantModal onClose={() => setOpen(false)} />}
    </>
  );
}

const BUBBLE_CSS = `
.astra-bubble {
  position: fixed;
  z-index: 45;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: transparent;
  box-shadow: 0 4px 24px rgba(117,133,100,0.35);
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}
.astra-bubble:active {
  transform: scale(0.96);
}
.astra-bubble__glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: conic-gradient(
    from 0deg,
    #758564,
    #BBC4AA,
    #5C6B4E,
    #3E3E31,
    #758564
  );
  opacity: 0.62;
  filter: blur(0.5px);
  animation: astra-spin 4s linear infinite, astra-hue 9s ease-in-out infinite;
}
.astra-bubble[data-pulse="1"] .astra-bubble__glow {
  opacity: 0.95;
  animation: astra-spin 1.4s linear infinite, astra-hue 5s ease-in-out infinite;
}
.astra-bubble__icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
  color: #FFFFFF;
  text-shadow: 0 1px 2px rgba(0,0,0,0.18);
  pointer-events: none;
}
.astra-bubble__badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #C9623F;
  border: 2px solid #F6F3EE;
}
@keyframes astra-spin {
  to { transform: rotate(360deg); }
}
@keyframes astra-hue {
  0%, 100% { filter: blur(0.5px) hue-rotate(0deg); }
  50%      { filter: blur(0.5px) hue-rotate(-12deg); }
}
@media (prefers-reduced-motion: reduce) {
  .astra-bubble__glow {
    animation: none;
  }
}
`;
