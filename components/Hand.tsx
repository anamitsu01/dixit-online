"use client";

import Card from "./Card";
import type { CardId } from "@/lib/types";

const REPLENISH_REVEAL_DELAY_MS = 350;

export default function Hand({
  hand,
  selected,
  disabled,
  onSelect,
  newCardIds,
}: {
  hand: CardId[];
  selected: CardId | null;
  disabled?: boolean;
  onSelect: (cardId: CardId) => void;
  /** Cards just drawn to replenish the hand; shown face-down then flipped, like the initial deal. */
  newCardIds?: ReadonlySet<CardId>;
}) {
  if (hand.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {hand.map((cardId) => (
        <Card
          key={cardId}
          cardId={cardId}
          size="md"
          selected={selected === cardId}
          disabled={disabled}
          onClick={() => onSelect(cardId)}
          revealDelayMs={newCardIds?.has(cardId) ? REPLENISH_REVEAL_DELAY_MS : undefined}
        />
      ))}
    </div>
  );
}
