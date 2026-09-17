"use client";

import Card from "./Card";
import type { CardId } from "@/lib/types";

export default function Hand({
  hand,
  selected,
  disabled,
  onSelect,
}: {
  hand: CardId[];
  selected: CardId | null;
  disabled?: boolean;
  onSelect: (cardId: CardId) => void;
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
        />
      ))}
    </div>
  );
}
