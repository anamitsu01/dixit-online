"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSocket, loadIdentity, saveIdentity, clearIdentity } from "@/lib/socketClient";
import type { RoomState, CardId } from "@/lib/types";
import Lobby from "./Lobby";
import GameBoard from "./GameBoard";
import Scoreboard from "./Scoreboard";
import ConfirmDialog from "./ConfirmDialog";

type ConnState = "connecting" | "needs-name" | "in-room" | "not-found";

export default function GameRoom({ code }: { code: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<ConnState>("connecting");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const attemptedRejoin = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    function onUpdate(next: RoomState) {
      setRoom(next);
      setState("in-room");
    }
    function onError(message: string) {
      setJoinError(message);
    }

    socket.on("room:update", onUpdate);
    socket.on("room:error", onError);

    function tryRejoin() {
      if (attemptedRejoin.current) return;
      attemptedRejoin.current = true;
      const identity = loadIdentity(code);
      if (!identity) {
        setState("needs-name");
        return;
      }
      socket.emit("room:rejoin", { code, playerId: identity.playerId }, (res) => {
        if (res.ok) {
          setPlayerId(identity.playerId);
          setRoom(res.data.room);
          setState("in-room");
        } else {
          setState("needs-name");
        }
      });
    }

    if (socket.connected) {
      tryRejoin();
    } else {
      socket.once("connect", tryRejoin);
    }

    return () => {
      socket.off("room:update", onUpdate);
      socket.off("room:error", onError);
      socket.off("connect", tryRejoin);
    };
  }, [code]);

  const handleJoin = useCallback(
    (name: string) => {
      const socket = getSocket();
      setJoinError(null);
      socket.emit("room:join", { code, name }, (res) => {
        if (res.ok) {
          saveIdentity(code, { playerId: res.data.playerId, name });
          setPlayerId(res.data.playerId);
          setRoom(res.data.room);
          setState("in-room");
        } else {
          setJoinError(res.error);
        }
      });
    },
    [code]
  );

  const handleStart = useCallback(async (): Promise<string | null> => {
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit("room:start", { code }, (res) => resolve(res.ok ? null : res.error));
    });
  }, [code]);

  const handleSubmitClue = useCallback(
    async (cardId: CardId, clue: string): Promise<string | null> => {
      const socket = getSocket();
      return new Promise((resolve) => {
        socket.emit("game:submitClue", { code, cardId, clue }, (res) => resolve(res.ok ? null : res.error));
      });
    },
    [code]
  );

  const handleSubmitCard = useCallback(
    async (cardId: CardId): Promise<string | null> => {
      const socket = getSocket();
      return new Promise((resolve) => {
        socket.emit("game:submitCard", { code, cardId }, (res) => resolve(res.ok ? null : res.error));
      });
    },
    [code]
  );

  const handleSubmitVote = useCallback(
    async (cardId: CardId): Promise<string | null> => {
      const socket = getSocket();
      return new Promise((resolve) => {
        socket.emit("game:submitVote", { code, cardId }, (res) => resolve(res.ok ? null : res.error));
      });
    },
    [code]
  );

  const handleNextRound = useCallback(async (): Promise<string | null> => {
    const socket = getSocket();
    return new Promise((resolve) => {
      socket.emit("game:nextRound", { code }, (res) => resolve(res.ok ? null : res.error));
    });
  }, [code]);

  const handleLeave = useCallback(() => {
    const socket = getSocket();
    clearIdentity(code);
    socket.disconnect();
    socket.connect();
    router.push("/");
  }, [code, router]);

  if (state === "connecting") {
    return <Centered>接続中…</Centered>;
  }

  if (state === "needs-name") {
    return <JoinForm code={code} onJoin={handleJoin} error={joinError} />;
  }

  if (!room || !playerId) {
    return <Centered>読み込み中…</Centered>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          退出する
        </button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1">
          {room.phase === "lobby" ? (
            <Lobby room={room} viewerId={playerId} onStart={handleStart} />
          ) : (
            <GameBoard
              room={room}
              viewerId={playerId}
              onSubmitClue={handleSubmitClue}
              onSubmitCard={handleSubmitCard}
              onSubmitVote={handleSubmitVote}
              onNextRound={handleNextRound}
            />
          )}
        </div>
        <Scoreboard room={room} viewerId={playerId} />
      </div>

      {showLeaveConfirm && (
        <ConfirmDialog
          title="ゲームから退出しますか?"
          message="退出するとこの部屋から抜け、ホーム画面に戻ります。この操作は取り消せません。"
          confirmLabel="退出する"
          onConfirm={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  );
}

function JoinForm({
  code,
  onJoin,
  error,
}: {
  code: string;
  onJoin: (name: string) => void;
  error: string | null;
}) {
  const [name, setName] = useState("");
  return (
    <Centered>
      <div className="w-full max-w-sm text-center">
        <p className="mb-1 text-white/60">部屋 {code} に参加</p>
        <h1 className="mb-6 text-2xl font-bold">お名前を入力してください</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onJoin(name.trim())}
          placeholder="ニックネーム"
          maxLength={24}
          className="mb-4 w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-center text-lg"
          autoFocus
        />
        <button
          onClick={() => name.trim() && onJoin(name.trim())}
          disabled={!name.trim()}
          className="w-full rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 px-8 py-3 font-bold text-black"
        >
          参加する
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[50vh] items-center justify-center text-center">{children}</div>;
}
