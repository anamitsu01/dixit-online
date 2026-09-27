"use client";

import { getPlayerColor } from "@/lib/playerColors";
import type { Player } from "@/lib/types";

export default function PlayerTag({
  player,
  size = "md",
}: {
  player: Pick<Player, "name" | "colorIndex" | "isHost"> & Partial<Pick<Player, "connected">>;
  size?: "sm" | "md";
}) {
  const color = getPlayerColor(player.colorIndex);
  const dotSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const connected = player.connected ?? true;

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className={`${dotSize} shrink-0 rounded-full`}
        style={{ backgroundColor: color.hex, opacity: connected ? 1 : 0.35 }}
      />
      <span className="truncate">
        {player.name}
        {player.isHost ? " 👑" : ""}
      </span>
    </span>
  );
}
