"use client";

import { useEffect, useState } from "react";
import type { CardId } from "@/lib/types";

const FLIP_DURATION_MS = 550;

// Card display size per breakpoint. `md` (the main gameplay size used for
// hands, votes and reveals) doubles on tablet/desktop (>=768px); phones keep
// the compact size. `sm`/`lg` are used in denser, secondary UI and stay fixed.
export const CARD_SIZE_CLASSES = {
  sm: "w-16 h-[90px]",
  md: "w-[100px] h-[140px] md:w-[200px] md:h-[280px]",
  lg: "w-40 h-[224px]",
} as const;
const SIZE_CLASSES = CARD_SIZE_CLASSES;
export type CardSize = keyof typeof CARD_SIZE_CLASSES;

interface CardProps {
  cardId: CardId;
  size?: keyof typeof SIZE_CLASSES;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  badge?: string | number;
  /** Hex color used for the border/glow, e.g. to show who owns this card. Overrides `selected`'s amber border. */
  accentColor?: string;
  onClick?: () => void;
  /** Card starts face-down and flips to reveal its face after this delay (ms), once, on mount. Used for the deal-in / hand-replenish animations. */
  revealDelayMs?: number;
}

export default function Card({
  cardId,
  size = "md",
  selected = false,
  disabled = false,
  faceDown = false,
  badge,
  accentColor,
  onClick,
  revealDelayMs,
}: CardProps) {
  const hidden = faceDown || cardId < 0;
  const revealing = revealDelayMs !== undefined;
  const [flipped, setFlipped] = useState(!revealing);

  useEffect(() => {
    if (revealDelayMs === undefined) return;
    const t = setTimeout(() => setFlipped(true), revealDelayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- play once per mount for this card instance
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition-transform duration-150 ${
        SIZE_CLASSES[size]
      } ${
        accentColor
          ? "-translate-y-1"
          : selected
            ? "border-amber-300 -translate-y-2 shadow-lg shadow-amber-300/30"
            : "border-white/10"
      } ${onClick && !disabled ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${
        disabled ? "opacity-50" : ""
      }`}
      style={
        accentColor
          ? { borderColor: accentColor, boxShadow: `0 0 16px -2px ${accentColor}` }
          : undefined
      }
    >
      {revealing ? (
        <FlipFace cardId={cardId} flipped={flipped} />
      ) : hidden ? (
        <CardBack />
      ) : (
        <CardFace cardId={cardId} />
      )}
      {badge !== undefined && (
        <span className="absolute top-1 left-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1 text-xs font-bold text-white md:top-2 md:left-2 md:h-8 md:min-w-8 md:text-sm">
          {badge}
        </span>
      )}
    </button>
  );
}

function FlipFace({ cardId, flipped }: { cardId: CardId; flipped: boolean }) {
  return (
    <div className="h-full w-full [perspective:1000px]">
      <div
        className="relative h-full w-full [transform-style:preserve-3d] transition-transform ease-out"
        style={{
          transitionDuration: `${FLIP_DURATION_MS}ms`,
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <CardBack />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardFace cardId={cardId} />
        </div>
      </div>
    </div>
  );
}

export function cardImageSrc(cardId: CardId): string {
  return `/cards/${String(cardId + 1).padStart(3, "0")}.webp`;
}

export function CardFace({ cardId }: { cardId: CardId }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size local static assets, no next/image optimization needed
    <img
      src={cardImageSrc(cardId)}
      alt=""
      draggable={false}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}

export function CardBack() {
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cardback" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <rect width="100" height="140" fill="url(#cardback)" />
      <rect x="8" y="8" width="84" height="124" rx="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <circle cx="50" cy="70" r="18" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <circle cx="50" cy="70" r="6" fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}
