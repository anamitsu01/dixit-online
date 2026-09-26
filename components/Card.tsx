"use client";

import type { CardId } from "@/lib/types";

const SIZES = {
  sm: { w: 64, h: 90 },
  md: { w: 100, h: 140 },
  lg: { w: 160, h: 224 },
} as const;

interface CardProps {
  cardId: CardId;
  size?: keyof typeof SIZES;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  badge?: string | number;
  onClick?: () => void;
}

export default function Card({
  cardId,
  size = "md",
  selected = false,
  disabled = false,
  faceDown = false,
  badge,
  onClick,
}: CardProps) {
  const { w, h } = SIZES[size];
  const hidden = faceDown || cardId < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition-transform duration-150 ${
        selected ? "border-amber-300 -translate-y-2 shadow-lg shadow-amber-300/30" : "border-white/10"
      } ${onClick && !disabled ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${
        disabled ? "opacity-50" : ""
      }`}
      style={{ width: w, height: h }}
    >
      {hidden ? <CardBack w={w} h={h} /> : <CardFace cardId={cardId} w={w} h={h} />}
      {badge !== undefined && (
        <span className="absolute top-1 left-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function cardImageSrc(cardId: CardId): string {
  return `/cards/${String(cardId + 1).padStart(3, "0")}.webp`;
}

function CardFace({ cardId, w, h }: { cardId: CardId; w: number; h: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size local static assets, no next/image optimization needed
    <img
      src={cardImageSrc(cardId)}
      alt=""
      draggable={false}
      loading="lazy"
      width={w}
      height={h}
      className="h-full w-full object-cover"
    />
  );
}

function CardBack({ w, h }: { w: number; h: number }) {
  return (
    <svg viewBox="0 0 100 140" width={w} height={h} xmlns="http://www.w3.org/2000/svg">
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
