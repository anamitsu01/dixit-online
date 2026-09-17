"use client";

import { useState } from "react";
import type { RoomState } from "@/lib/types";
import { MIN_PLAYERS } from "@/lib/types";

export default function Lobby({
  room,
  viewerId,
  onStart,
}: {
  room: RoomState;
  viewerId: string;
  onStart: () => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const me = room.players.find((p) => p.id === viewerId);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${room.code}` : "";

  async function handleStart() {
    setStarting(true);
    const err = await onStart();
    setStarting(false);
    setError(err);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // clipboard unavailable; user can copy manually
    }
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <p className="text-white/60 mb-1">部屋コード</p>
      <div className="mb-4 flex items-center justify-center gap-3">
        <span className="text-5xl font-black tracking-[0.3em] text-amber-300">{room.code}</span>
      </div>
      <div className="mb-6 flex items-center justify-center gap-2">
        <input
          readOnly
          value={shareUrl}
          className="w-full max-w-sm rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/70"
        />
        <button
          onClick={copyLink}
          className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-sm whitespace-nowrap"
        >
          リンクをコピー
        </button>
      </div>

      <ul className="mb-6 space-y-2 text-left">
        {room.players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-4 py-3"
          >
            <span>
              {p.name}
              {p.isHost ? " 👑" : ""}
              {p.id === viewerId ? "(あなた)" : ""}
            </span>
            <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-white/20"}`} />
          </li>
        ))}
      </ul>

      {room.players.length < MIN_PLAYERS && (
        <p className="mb-4 text-sm text-white/50">
          開始には最低{MIN_PLAYERS}人必要です(現在{room.players.length}人)
        </p>
      )}

      {me?.isHost ? (
        <button
          onClick={handleStart}
          disabled={starting || room.players.length < MIN_PLAYERS}
          className="rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed px-8 py-3 font-bold text-black"
        >
          {starting ? "開始中..." : "ゲームを開始"}
        </button>
      ) : (
        <p className="text-white/60">ホストの開始を待っています…</p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
