"use client";

import { useEffect, useState } from "react";
import { AssistantModal } from "./AssistantModal";

/**
 * Floating sage / olive concierge button. Pure CSS conic-gradient with
 * a slow rotation + hue-rotate filter. Mounts the AssistantModal on
 * tap. Unread-badge prop is forwarded from the layout so the dot
 * lights up when the studio inbox has unread chats.
 */
export function AssistantBubble({
  hasUnread = false,
}: {
  hasUnread?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Pulse on first paint to draw the eye, settles after 1.5s.
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{BUBBLE_CSS}</style>
      <button
        type="button"
        aria-label="Open Astrabody assistant"
        onClick={() => setOpen(true)}
        className="astra-bubble"
        data-pulse={pulse ? "1" : "0"}
        style={{
          right: "20px",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 116px)",
        }}
      >
        <span className="astra-bubble__glow" aria-hidden />
        <span className="astra-bubble__icon" aria-hidden>
          ✦
        </span>
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
