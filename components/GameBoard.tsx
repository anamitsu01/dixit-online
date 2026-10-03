"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Hand from "./Hand";
import PlayerTag from "./PlayerTag";
import DealingHand from "./DealingHand";
import PointingHand from "./PointingHand";
import { getPlayerColor } from "@/lib/playerColors";
import type { CardId, Player, RoomState, RoundResult } from "@/lib/types";

type AsyncAction<T extends unknown[]> = (...args: T) => Promise<string | null>;

function votersByCard(result: RoundResult): Map<CardId, string[]> {
  const m = new Map<CardId, string[]>();
  for (const v of result.votes) {
    const list = m.get(v.votedCardId) ?? [];
    list.push(v.playerId);
    m.set(v.votedCardId, list);
  }
  return m;
}

// Points a voter earned purely from guessing the storyteller's card (or the
// flat "everyone/no one guessed" bonus) - excludes the separate +1-per-vote
// bonus a player's own decoy card can earn, which isn't tied to any hand.
function guessBonusFor(playerId: string, result: RoundResult): number {
  if (result.everyoneOrNoOneCorrect) return 2;
  const guessedRight = result.votes.some(
    (v) => v.playerId === playerId && v.votedCardId === result.storytellerCardId
  );
  return guessedRight ? 3 : 0;
}

export default function GameBoard({
  room,
  viewerId,
  onSubmitClue,
  onSubmitCard,
  onSubmitVote,
  onNextRound,
  onPlayAgain,
}: {
  room: RoomState;
  viewerId: string;
  onSubmitClue: AsyncAction<[CardId, string]>;
  onSubmitCard: AsyncAction<[CardId]>;
  onSubmitVote: AsyncAction<[CardId]>;
  onNextRound: AsyncAction<[]>;
  onPlayAgain: AsyncAction<[]>;
}) {
  const me = room.players.find((p) => p.id === viewerId);
  const storyteller = room.players[room.storytellerIndex];
  const isStoryteller = storyteller?.id === viewerId;

  // A new game (first start, or "play again") always resets to round 1 with
  // a freshly dealt hand. Snapshot that hand once per such transition and
  // play the dealing animation for it. Adjusted during render (React's
  // documented pattern for resetting state on a prop change) rather than in
  // an effect, since it must happen before this render commits.
  const [prevRound, setPrevRound] = useState(room.round);
  const [prevPhase, setPrevPhase] = useState(room.phase);
  // GameBoard can mount for the first time already sitting at round 1 /
  // phase "clue" (lobby -> clue is a fresh mount), so the deal must also be
  // detected from the initial state, not only from a later change.
  const [dealtHand, setDealtHand] = useState<CardId[] | null>(() =>
    room.round === 1 && room.phase === "clue" ? (me?.hand ?? null) : null
  );
  // Hand as last observed at the start of a round, used to spot the single
  // replenishment card(s) drawn for the next round so just that card can
  // play the same face-down-then-flip reveal as the initial deal.
  const [lastRoundHand, setLastRoundHand] = useState<CardId[]>(() => me?.hand ?? []);
  const [newCardIds, setNewCardIds] = useState<ReadonlySet<CardId>>(new Set());

  if (room.round !== prevRound) {
    setPrevRound(room.round);
    const currentHand = me?.hand ?? [];
    if (room.round === 1) {
      setDealtHand(currentHand.length ? currentHand : null);
      setNewCardIds(new Set());
    } else {
      setDealtHand(null);
      setNewCardIds(new Set(currentHand.filter((c) => !lastRoundHand.includes(c))));
    }
    setLastRoundHand(currentHand);
  }
  if (room.phase !== prevPhase) {
    setPrevPhase(room.phase);
    // If the round moves on before this client's local animation finished
    // (e.g. a slow reconnect), don't block them behind a stale animation.
    if (room.phase !== "clue" && dealtHand !== null) {
      setDealtHand(null);
    }
  }

  if (room.phase === "gameover") {
    return <GameOver room={room} viewerId={viewerId} onPlayAgain={onPlayAgain} />;
  }

  const showDealing = room.phase === "clue" && dealtHand !== null;

  return (
    <div className="mx-auto max-w-3xl flex flex-col items-center gap-6">
      {room.clue && (room.phase === "submit" || room.phase === "vote" || room.phase === "reveal") && (
        <div className="rounded-xl bg-white/5 border border-white/10 px-6 py-3 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">お題</p>
          <p className="text-xl font-semibold">{room.clue}</p>
        </div>
      )}

      {showDealing && dealtHand && (
        <DealingHand hand={dealtHand} onComplete={() => setDealtHand(null)} />
      )}

      {room.phase === "clue" && !showDealing && (
        <CluePhase
          isStoryteller={isStoryteller}
          hand={me?.hand ?? []}
          newCardIds={newCardIds}
          onSubmitClue={onSubmitClue}
        />
      )}

      {room.phase === "submit" && (
        <SubmitPhase
          room={room}
          viewerId={viewerId}
          isStoryteller={isStoryteller}
          hand={me?.hand ?? []}
          onSubmitCard={onSubmitCard}
        />
      )}

      {room.phase === "vote" && (
        <VotePhase
          room={room}
          viewerId={viewerId}
          isStoryteller={isStoryteller}
          onSubmitVote={onSubmitVote}
        />
      )}

      {room.phase === "reveal" && (
        <RevealPhase room={room} viewerId={viewerId} onNextRound={onNextRound} />
      )}
    </div>
  );
}

function CluePhase({
  isStoryteller,
  hand,
  newCardIds,
  onSubmitClue,
}: {
  isStoryteller: boolean;
  hand: CardId[];
  newCardIds?: ReadonlySet<CardId>;
  onSubmitClue: AsyncAction<[CardId, string]>;
}) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const [clue, setClue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isStoryteller) {
    return (
      <div className="text-center">
        <p className="text-lg text-white/70 mb-6">語り手がお題を考えています…</p>
        <Hand hand={hand} selected={null} disabled onSelect={() => {}} newCardIds={newCardIds} />
      </div>
    );
  }

  async function handleSubmit() {
    if (selected === null) {
      setError("カードを1枚選んでください");
      return;
    }
    setBusy(true);
    const err = await onSubmitClue(selected, clue);
    setBusy(false);
    setError(err);
  }

  return (
    <div className="w-full text-center">
      <p className="text-lg mb-4">
        あなたが語り手です。カードを1枚選び、お題(単語・フレーズ・一言)を入力してください。
      </p>
      <Hand hand={hand} selected={selected} onSelect={setSelected} newCardIds={newCardIds} />
      <div className="mt-6 flex flex-col items-center gap-3">
        <input
          value={clue}
          onChange={(e) => setClue(e.target.value)}
          placeholder="お題を入力…"
          maxLength={80}
          className="w-full max-w-md rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-center"
        />
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 px-8 py-3 font-bold text-black"
        >
          {busy ? "送信中..." : "お題を出す"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function SubmitPhase({
  room,
  viewerId,
  isStoryteller,
  hand,
  onSubmitCard,
}: {
  room: RoomState;
  viewerId: string;
  isStoryteller: boolean;
  hand: CardId[];
  onSubmitCard: AsyncAction<[CardId]>;
}) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alreadySubmitted = room.submissions.some((s) => s.playerId === viewerId);
  const submittedCount = room.submissions.length;
  const totalNeeded = room.players.length;

  async function handleSubmit() {
    if (selected === null) {
      setError("カードを1枚選んでください");
      return;
    }
    setBusy(true);
    const err = await onSubmitCard(selected);
    setBusy(false);
    setError(err);
  }

  if (isStoryteller || alreadySubmitted) {
    return (
      <div className="text-center">
        <p className="text-white/70">
          カード提出待ち… ({submittedCount}/{totalNeeded})
        </p>
        <SubmitterList room={room} />
      </div>
    );
  }

  return (
    <div className="w-full text-center">
      <p className="text-lg mb-4">お題に一番合うと思うカードを選んで提出してください。</p>
      <Hand hand={hand} selected={selected} onSelect={setSelected} />
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 px-8 py-3 font-bold text-black"
        >
          {busy ? "送信中..." : "このカードを提出"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-sm text-white/50">
          提出状況: {submittedCount}/{totalNeeded}
        </p>
      </div>
    </div>
  );
}

function SubmitterList({ room }: { room: RoomState }) {
  const submittedIds = new Set(room.submissions.map((s) => s.playerId));
  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-2">
      {room.players.map((p) => (
        <li
          key={p.id}
          className={`rounded-full px-3 py-1 text-sm ${
            submittedIds.has(p.id) ? "bg-white/10" : "opacity-40"
          }`}
        >
          <PlayerTag player={p} size="sm" />
        </li>
      ))}
    </ul>
  );
}

function VotePhase({
  room,
  viewerId,
  isStoryteller,
  onSubmitVote,
}: {
  room: RoomState;
  viewerId: string;
  isStoryteller: boolean;
  onSubmitVote: AsyncAction<[CardId]>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CardId | null>(null);
  const myVote = room.votes.find((v) => v.playerId === viewerId);
  const mySubmission = room.submissions.find((s) => s.playerId === viewerId);
  const votedCount = room.votes.length;
  const totalNeeded = room.players.length - 1;

  async function handleVote(cardId: CardId) {
    setBusy(cardId);
    const err = await onSubmitVote(cardId);
    setBusy(null);
    setError(err);
  }

  const canVote = !isStoryteller && !myVote;

  return (
    <div className="w-full text-center">
      <p className="text-lg mb-4">
        {isStoryteller
          ? "他のプレイヤーが投票しています…"
          : myVote
            ? "投票しました。他のプレイヤーを待っています…"
            : "語り手のカードだと思うものをクリックしてください。"}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {room.revealOrder.map((cardId, i) => {
          const isMine = mySubmission?.cardId === cardId;
          const isMyVote = myVote?.votedCardId === cardId;
          return (
            <div key={cardId} className="relative">
              <Card
                cardId={cardId}
                size="md"
                badge={i + 1}
                selected={isMyVote}
                disabled={busy !== null || !canVote || isMine}
                onClick={canVote && !isMine ? () => handleVote(cardId) : undefined}
              />
              {isMine && (
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/70">
                  あなたのカード
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-white/50">
        投票状況: {votedCount}/{totalNeeded}
      </p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

// Reveal sequence timing: ① a "結果発表" cut-in flows right-to-left across
// the screen while fading out → ② a short pause → ③ hands point at every
// card simultaneously, held for a beat → ④ the storyteller's card is
// emphasized and every card's score pops up next to its pointing hand. Only
// then does the interactive summary/next-round view settle in.
//
// If this round pushed someone to the winning score, the sequence continues
// after "done": a "決着！" cut-in flows across, then (0.7s later) the
// winner(s) are highlighted and the next-round button appears.
type RevealStage =
  | "cutin"
  | "gap"
  | "point"
  | "score"
  | "done"
  | "finale-cutin"
  | "finale-gap"
  | "finale";
const STAGE_ORDER: RevealStage[] = [
  "cutin",
  "gap",
  "point",
  "score",
  "done",
  "finale-cutin",
  "finale-gap",
  "finale",
];
const CUTIN_DURATION_MS = 900;
const GAP_AFTER_CUTIN_MS = 700;
const POINT_HOLD_MS = 900;
const SCORE_HOLD_MS = 900;
const FINALE_PAUSE_MS = 900;
const CONFETTI_COLORS = ["#ff4f87", "#ff9f1c", "#ffd166", "#1fb89a", "#3b82f6", "#9b5de5"];

function RevealPhase({
  room,
  viewerId,
  onNextRound,
}: {
  room: RoomState;
  viewerId: string;
  onNextRound: AsyncAction<[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<RevealStage>("cutin");
  const result = room.lastRoundResult;
  const me = room.players.find((p) => p.id === viewerId);

  useEffect(() => {
    const pointAt = CUTIN_DURATION_MS + GAP_AFTER_CUTIN_MS;
    const scoreAt = pointAt + POINT_HOLD_MS;
    const doneAt = scoreAt + SCORE_HOLD_MS;
    const finaleCutinAt = doneAt + FINALE_PAUSE_MS;
    const finaleGapAt = finaleCutinAt + CUTIN_DURATION_MS;
    const finaleAt = finaleGapAt + GAP_AFTER_CUTIN_MS;
    const timers = [
      setTimeout(() => setStage("gap"), CUTIN_DURATION_MS),
      setTimeout(() => setStage("point"), pointAt),
      setTimeout(() => setStage("score"), scoreAt),
      setTimeout(() => setStage("done"), doneAt),
      setTimeout(() => setStage("finale-cutin"), finaleCutinAt),
      setTimeout(() => setStage("finale-gap"), finaleGapAt),
      setTimeout(() => setStage("finale"), finaleAt),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const votesByCard = useMemo(() => {
    if (!result) return new Map<CardId, string[]>();
    return votersByCard(result);
  }, [result]);

  const { correctPlayers, incorrectPlayers } = useMemo(() => {
    if (!result) return { correctPlayers: [] as Player[], incorrectPlayers: [] as Player[] };
    const byId = (playerId: string) => room.players.find((p) => p.id === playerId);
    const correct: Player[] = [];
    const incorrect: Player[] = [];
    for (const v of result.votes) {
      const p = byId(v.playerId);
      if (!p) continue;
      (v.votedCardId === result.storytellerCardId ? correct : incorrect).push(p);
    }
    return { correctPlayers: correct, incorrectPlayers: incorrect };
  }, [result, room.players]);

  if (!result) return null;

  async function handleNext() {
    setBusy(true);
    const err = await onNextRound();
    setBusy(false);
    setError(err);
  }

  const reached = (target: RevealStage) =>
    STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);
  const pointRevealed = reached("point");
  const scoreRevealed = reached("score");
  const settled = reached("done");

  // Game over once someone hits the winning score (same rule as nextRound()).
  const topScore = Math.max(...room.players.map((p) => p.score));
  const gameEnding = topScore >= room.maxScore;
  const winners = gameEnding ? room.players.filter((p) => p.score === topScore) : [];
  const showNext = settled && (!gameEnding || stage === "finale");

  return (
    <div className="w-full text-center">
      <h2 className="text-2xl font-black text-amber-300 mb-2">結果発表</h2>

      {gameEnding && stage === "finale" && (
        <div
          ref={(el) => el?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="mx-auto mb-6 max-w-md rounded-2xl border-2 border-amber-300 bg-amber-300/10 px-6 py-4"
          style={{ animation: "winner-pop 700ms ease-out both, glow-pulse 1.4s ease-in-out 700ms infinite" }}
        >
          <p className="text-sm font-bold tracking-widest text-amber-200">🏆 優勝 🏆</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {winners.map((w) => (
              <span
                key={w.id}
                className="text-3xl font-black md:text-4xl"
                style={{ color: getPlayerColor(w.colorIndex).hex }}
              >
                👑 {w.name}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-white/60">{topScore}点</p>
        </div>
      )}

      {settled && (
        <div className="mx-auto mb-6 max-w-md rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm">
          {correctPlayers.length > 0 && (
            <div className="mb-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="text-emerald-300">正解 ✓</span>
              {correctPlayers.map((p) => (
                <PlayerTag key={p.id} player={p} size="sm" />
              ))}
            </div>
          )}
          {incorrectPlayers.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="text-white/50">不正解 ✗</span>
              {incorrectPlayers.map((p) => (
                <PlayerTag key={p.id} player={p} size="sm" />
              ))}
            </div>
          )}
          <p className="mt-2 text-white/60">
            {result.everyoneOrNoOneCorrect
              ? "全員正解 or 全員不正解 → 語り手は0点、他の全員に+2点"
              : "正解者がいたので語り手と正解者に+3点"}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-10 px-4">
        {result.revealed.map((r) => {
          const owner = room.players.find((p) => p.id === r.ownerId);
          const isStorytellerCard = r.cardId === result.storytellerCardId;
          const voterIds = votesByCard.get(r.cardId) ?? [];
          const ownerColor = owner ? getPlayerColor(owner.colorIndex) : null;
          const emphasize = isStorytellerCard && scoreRevealed;
          const storytellerBonus = isStorytellerCard ? (result.scoreDeltas[r.ownerId] ?? 0) : 0;
          // +1 per vote a non-storyteller's decoy card received - not tied to
          // any one hand, so it's shown on the card itself instead.
          const baitBonus = isStorytellerCard ? 0 : voterIds.length;
          return (
            <div
              key={r.cardId}
              className="flex flex-col items-center gap-2 rounded-xl p-3"
              style={ownerColor ? { backgroundColor: ownerColor.bg } : undefined}
            >
              <div
                className="relative z-20 transition-transform duration-300 ease-out"
                style={{ transform: emphasize ? "scale(1.08)" : "scale(1)" }}
              >
                <div
                  className="rounded-xl"
                  style={emphasize ? { animation: "glow-pulse 1.4s ease-in-out infinite" } : undefined}
                >
                  <Card
                    cardId={r.cardId}
                    size="md"
                    accentColor={ownerColor?.hex}
                    badge={
                      owner ? (
                        <>
                          <span className="truncate pl-1 pr-1 font-semibold" style={{ color: ownerColor?.hex }}>
                            {isStorytellerCard && <span className="mr-0.5">👑</span>}
                            {owner.name}
                          </span>
                          {scoreRevealed && (isStorytellerCard || baitBonus > 0) && (
                            <span
                              className="mr-1 shrink-0 text-emerald-300"
                              style={{ animation: "score-rise 450ms ease-out both" }}
                            >
                              +{isStorytellerCard ? storytellerBonus : baitBonus}
                            </span>
                          )}
                        </>
                      ) : undefined
                    }
                  />
                </div>
                {pointRevealed && voterIds.length > 0 && (
                  <div
                    className="absolute left-1/2 flex flex-wrap items-center justify-center gap-x-0.5 gap-y-1"
                    style={{ bottom: "-30px", width: "max-content", animation: "point-in 450ms ease-out both" }}
                  >
                    {voterIds.map((voterId) => {
                      const voter = room.players.find((p) => p.id === voterId);
                      if (!voter) return null;
                      const vc = getPlayerColor(voter.colorIndex);
                      const bonus = guessBonusFor(voterId, result);
                      const compact = voterIds.length > 1;
                      return (
                        <span key={voterId} className="relative flex items-center">
                          <PointingHand
                            color={vc.hex}
                            className={compact ? "w-7 md:w-10" : "w-12 md:w-16"}
                          />
                          <span
                            className="absolute left-1/2 top-full -mt-1 max-w-[3.5rem] -translate-x-1/2 truncate whitespace-nowrap rounded-full bg-[#0b0714]/80 px-1.5 py-0.5 text-[10px] font-semibold md:max-w-[5rem] md:text-[11px]"
                            style={{ color: vc.hex }}
                          >
                            {voter.name}
                          </span>
                          {scoreRevealed && bonus > 0 && (
                            <span
                              className={`font-mono font-black text-emerald-300 drop-shadow ${
                                compact ? "text-sm md:text-base" : "text-base md:text-lg"
                              }`}
                              style={{ animation: "score-rise 450ms ease-out both" }}
                            >
                              +{bonus}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {settled && voterIds.length === 0 && (
                <span className="mt-2 text-[11px] text-white/30">投票なし</span>
              )}
            </div>
          );
        })}
      </div>

      {showNext && (
        <div className="mt-8">
          {me?.isHost ? (
            <button
              onClick={handleNext}
              disabled={busy}
              className="rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 px-8 py-3 font-bold text-black"
            >
              {busy ? "進行中..." : "次のラウンドへ"}
            </button>
          ) : (
            <p className="text-white/60">ホストが次のラウンドに進めるのを待っています…</p>
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      )}

      {stage === "cutin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40">
          <span
            className="whitespace-nowrap text-5xl font-black tracking-widest text-amber-300 drop-shadow-[0_0_20px_rgba(252,211,77,0.6)] md:text-7xl"
            style={{ animation: `cutin-flow ${CUTIN_DURATION_MS}ms ease-in-out both` }}
          >
            結果発表
          </span>
        </div>
      )}

      {gameEnding && stage === "finale-cutin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/50">
          <span
            className="whitespace-nowrap text-6xl font-black tracking-widest text-rose-400 drop-shadow-[0_0_24px_rgba(251,113,133,0.7)] md:text-8xl"
            style={{ animation: `cutin-flow ${CUTIN_DURATION_MS}ms ease-in-out both` }}
          >
            決着！
          </span>
        </div>
      )}

      {gameEnding && stage === "finale" && (
        <>
          <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                className="absolute top-0 block h-3 w-2 rounded-sm"
                style={{
                  left: `${(i * 37) % 100}%`,
                  backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animation: `confetti-fall ${2.6 + (i % 5) * 0.4}s linear ${((i * 13) % 15) / 10}s both`,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GameOver({
  room,
  viewerId,
  onPlayAgain,
}: {
  room: RoomState;
  viewerId: string;
  onPlayAgain: AsyncAction<[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winners = room.players.filter((p) => room.winnerIds.includes(p.id));
  const me = room.players.find((p) => p.id === viewerId);

  async function handlePlayAgain() {
    setBusy(true);
    const err = await onPlayAgain();
    setBusy(false);
    setError(err);
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-black text-amber-300 mb-2">ゲーム終了!</h2>
      <p className="mb-6 text-white/70">
        {winners.map((w) => w.name).join(" と ")} の勝利! 🎉
      </p>
      <ul className="space-y-2 text-left">
        {sorted.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-lg px-4 py-3 ${
              room.winnerIds.includes(p.id) ? "bg-amber-300/10 ring-1 ring-amber-300/40" : "bg-white/5"
            } ${p.id === viewerId ? "font-semibold" : ""}`}
          >
            <span className="flex items-center gap-2">
              <span className="text-white/40">{i + 1}.</span>
              <PlayerTag player={p} />
            </span>
            <span className="font-mono">{p.score}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {me?.isHost ? (
          <button
            onClick={handlePlayAgain}
            disabled={busy}
            className="rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-40 px-8 py-3 font-bold text-black"
          >
            {busy ? "準備中..." : "もう一度プレイする"}
          </button>
        ) : (
          <p className="text-white/60">ホストが次のゲームを始めるのを待っています…</p>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {room.history.length > 0 && (
        <div className="mt-10 text-left">
          <h3 className="mb-3 text-center text-lg font-bold text-white/80">ラウンドの振り返り</h3>
          <div className="space-y-2">
            {room.history.map((result) => (
              <RoundHistoryEntry key={result.round} result={result} players={room.players} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoundHistoryEntry({ result, players }: { result: RoundResult; players: Player[] }) {
  const voters = votersByCard(result);
  const storyteller = players.find((p) => p.id === result.storytellerId);
  return (
    <details className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <summary className="cursor-pointer select-none text-sm text-white/80">
        ラウンド{result.round} ・ 語り手: {storyteller?.name ?? "?"} ・ お題「{result.clue}」
      </summary>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {result.revealed.map((r) => {
          const owner = players.find((p) => p.id === r.ownerId);
          const isStorytellerCard = r.cardId === result.storytellerCardId;
          const voterIds = voters.get(r.cardId) ?? [];
          const delta = result.scoreDeltas[r.ownerId] ?? 0;
          const ownerColor = owner ? getPlayerColor(owner.colorIndex) : null;
          return (
            <div
              key={r.cardId}
              className="flex flex-col items-center gap-1 rounded-lg p-2"
              style={ownerColor ? { backgroundColor: ownerColor.bg } : undefined}
            >
              <Card
                cardId={r.cardId}
                size="sm"
                accentColor={ownerColor?.hex}
                badge={isStorytellerCard ? "👑" : undefined}
              />
              {owner && <PlayerTag player={owner} size="sm" />}
              <div className="flex max-w-[120px] flex-wrap justify-center gap-1">
                {voterIds.length > 0 ? (
                  voterIds.map((voterId) => {
                    const voter = players.find((p) => p.id === voterId);
                    if (!voter) return null;
                    const vc = getPlayerColor(voter.colorIndex);
                    return (
                      <span
                        key={voterId}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: vc.bg, color: vc.hex }}
                      >
                        {voter.name}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[10px] text-white/30">投票なし</span>
                )}
              </div>
              <span className="text-[11px] font-mono text-emerald-300">+{delta}</span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
