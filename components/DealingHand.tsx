"use client";

import { useEffect, useState } from "react";
import { CARD_SIZE_CLASSES, CardBack, CardFace } from "./Card";
import type { CardId } from "@/lib/types";

const DEAL_STAGGER_MS = 160;
const DEAL_DURATION_MS = 420;
const PAUSE_BEFORE_FLIP_MS = 400;
const FLIP_DURATION_MS = 550;
const FLIP_STAGGER_MS = 90;
const DONE_PAUSE_MS = 250;

export default function DealingHand({
  hand,
  onComplete,
}: {
  hand: CardId[];
  onComplete: () => void;
}) {
  const [dealtCount, setDealtCount] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    hand.forEach((_, i) => {
      timers.push(
        setTimeout(() => setDealtCount((c) => Math.max(c, i + 1)), i * DEAL_STAGGER_MS)
      );
    });

    const dealEndMs = Math.max(0, hand.length - 1) * DEAL_STAGGER_MS + DEAL_DURATION_MS;
    timers.push(setTimeout(() => setFlipped(true), dealEndMs + PAUSE_BEFORE_FLIP_MS));

    const flipEndMs =
      dealEndMs +
      PAUSE_BEFORE_FLIP_MS +
      Math.max(0, hand.length - 1) * FLIP_STAGGER_MS +
      FLIP_DURATION_MS;
    timers.push(setTimeout(onComplete, flipEndMs + DONE_PAUSE_MS));

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- play once per mount, driven by the hand this instance was created with
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-lg text-white/70">カードを配っています…</p>
      <div className="flex flex-wrap justify-center gap-3">
        {hand.map((cardId, i) => (
          <div
            key={cardId}
            className="transition-all ease-out"
            style={{
              transitionDuration: `${DEAL_DURATION_MS}ms`,
              opacity: i < dealtCount ? 1 : 0,
              transform: i < dealtCount ? "translateY(0) scale(1)" : "translateY(-36px) scale(0.75)",
            }}
          >
            <FlipCard
              cardId={cardId}
              flipped={flipped}
              flipDelayMs={i * FLIP_STAGGER_MS}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FlipCard({
  cardId,
  flipped,
  flipDelayMs,
}: {
  cardId: CardId;
  flipped: boolean;
  flipDelayMs: number;
}) {
  return (
    <div className={`${CARD_SIZE_CLASSES.md} shrink-0 [perspective:1000px]`}>
      <div
        className="relative h-full w-full [transform-style:preserve-3d] transition-transform ease-out"
        style={{
          transitionDuration: `${FLIP_DURATION_MS}ms`,
          transitionDelay: `${flipDelayMs}ms`,
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl border-2 border-white/10 [backface-visibility:hidden]">
          <CardBack />
        </div>
        <div className="absolute inset-0 overflow-hidden rounded-xl border-2 border-white/10 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardFace cardId={cardId} />
        </div>
      </div>
    </div>
  );
}
