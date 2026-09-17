"use client";

import type { RoomState } from "@/lib/types";

const PHASE_LABELS: Record<string, string> = {
  lobby: "ロビー",
  clue: "お題を待っています",
  submit: "カード提出中",
  vote: "投票中",
  reveal: "結果発表",
  gameover: "ゲーム終了",
};

export default function Scoreboard({ room, viewerId }: { room: RoomState; viewerId: string }) {
  const storyteller = room.players[room.storytellerIndex];
  const sorted = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <aside className="w-full lg:w-64 shrink-0 rounded-xl bg-white/5 p-4 border border-white/10">
      <div className="mb-3 text-sm text-white/60">
        ラウンド {room.round || "-"} ・ {PHASE_LABELS[room.phase] ?? room.phase}
      </div>
      {storyteller && room.phase !== "lobby" && room.phase !== "gameover" && (
        <div className="mb-3 text-sm">
          語り手: <span className="font-semibold text-amber-300">{storyteller.name}</span>
        </div>
      )}
      <ul className="space-y-2">
        {sorted.map((p) => (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              p.id === viewerId ? "bg-amber-300/10 ring-1 ring-amber-300/40" : "bg-white/5"
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-white/20"}`} />
              <span className="truncate">
                {p.name}
                {p.isHost ? " 👑" : ""}
              </span>
            </span>
            <span className="font-mono font-semibold">{p.score}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
