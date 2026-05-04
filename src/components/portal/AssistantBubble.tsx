"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantModal } from "./AssistantModal";

/**
 * Floating sage / olive concierge button. Draggable via pointer events —
 * tap opens the modal, drag repositions. Unread-badge prop lights up
 * when the studio inbox has unread chats.
 */
export function AssistantBubble({
  hasUnread = false,
}: {
  hasUnread?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    startClientX: number;
    startClientY: number;
    startBubbleX: number;
    startBubbleY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(t);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBubbleX: rect.left,
      startBubbleY: rect.top,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startClientX;
    const dy = e.clientY - drag.current.startClientY;
    if (!drag.current.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    drag.current.moved = true;
    const BUBBLE = 56;
    const newX = Math.max(8, Math.min(window.innerWidth - BUBBLE - 8, drag.current.startBubbleX + dx));
    const newY = Math.max(8, Math.min(window.innerHeight - BUBBLE - 8, drag.current.startBubbleY + dy));
    setPos({ x: newX, y: newY });
  }

  function onPointerUp() {
    if (!drag.current?.moved) setOpen(true);
    drag.current = null;
  }

  const bubbleStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: "20px", bottom: "calc(env(safe-area-inset-bottom, 0px) + 116px)" };

  return (
    <>
      <style>{BUBBLE_CSS}</style>
      <button
        type="button"
        aria-label="Open Astrabody assistant"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
  cursor: pointer;
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
