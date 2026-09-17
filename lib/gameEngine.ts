import {
  CardId,
  DECK_SIZE,
  HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Player,
  RevealedCard,
  RoomState,
  RoundResult,
  Vote,
  WINNING_SCORE,
} from "./types";

export class GameError extends Error {}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function createRoom(hostId: string, hostName: string): RoomState {
  const player: Player = {
    id: hostId,
    name: hostName,
    hand: [],
    score: 0,
    connected: true,
    isHost: true,
  };
  return {
    code: makeRoomCode(),
    phase: "lobby",
    players: [player],
    deck: [],
    storytellerIndex: 0,
    round: 0,
    clue: null,
    submissions: [],
    votes: [],
    revealOrder: [],
    lastRoundResult: null,
    winnerIds: [],
    maxScore: WINNING_SCORE,
    handSize: HAND_SIZE,
    createdAt: Date.now(),
  };
}

export function addPlayer(room: RoomState, playerId: string, name: string): RoomState {
  if (room.phase !== "lobby") {
    throw new GameError("このゲームはすでに開始されています");
  }
  if (room.players.some((p) => p.id === playerId)) {
    return room;
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new GameError(`部屋の定員(${MAX_PLAYERS}人)に達しています`);
  }
  const player: Player = {
    id: playerId,
    name,
    hand: [],
    score: 0,
    connected: true,
    isHost: false,
  };
  return { ...room, players: [...room.players, player] };
}

export function markConnection(room: RoomState, playerId: string, connected: boolean): RoomState {
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
  };
}

export function removePlayer(room: RoomState, playerId: string): RoomState {
  const players = room.players.filter((p) => p.id !== playerId);
  if (players.length > 0 && !players.some((p) => p.isHost)) {
    players[0] = { ...players[0], isHost: true };
  }
  return { ...room, players };
}

export function startGame(room: RoomState, requesterId: string): RoomState {
  const requester = room.players.find((p) => p.id === requesterId);
  if (!requester?.isHost) {
    throw new GameError("ホストのみがゲームを開始できます");
  }
  if (room.phase !== "lobby") {
    throw new GameError("すでにゲームが開始されています");
  }
  if (room.players.length < MIN_PLAYERS) {
    throw new GameError(`最低${MIN_PLAYERS}人必要です`);
  }

  const deck = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i));
  const players = room.players.map((p) => ({ ...p, score: 0, hand: [] as CardId[] }));

  for (const player of players) {
    player.hand = deck.splice(0, HAND_SIZE);
  }

  return {
    ...room,
    players,
    deck,
    phase: "clue",
    storytellerIndex: 0,
    round: 1,
    clue: null,
    submissions: [],
    votes: [],
    revealOrder: [],
    lastRoundResult: null,
    winnerIds: [],
  };
}

function currentStoryteller(room: RoomState): Player {
  return room.players[room.storytellerIndex];
}

export function submitClue(
  room: RoomState,
  playerId: string,
  cardId: CardId,
  clue: string
): RoomState {
  if (room.phase !== "clue") {
    throw new GameError("お題を出す局面ではありません");
  }
  const storyteller = currentStoryteller(room);
  if (storyteller.id !== playerId) {
    throw new GameError("あなたは語り手ではありません");
  }
  if (!storyteller.hand.includes(cardId)) {
    throw new GameError("そのカードは手札にありません");
  }
  const trimmed = clue.trim();
  if (!trimmed) {
    throw new GameError("お題を入力してください");
  }

  const players = room.players.map((p) =>
    p.id === playerId ? { ...p, hand: p.hand.filter((c) => c !== cardId) } : p
  );

  return {
    ...room,
    players,
    phase: "submit",
    clue: trimmed,
    submissions: [{ playerId, cardId }],
  };
}

export function submitCard(room: RoomState, playerId: string, cardId: CardId): RoomState {
  if (room.phase !== "submit") {
    throw new GameError("カードを提出する局面ではありません");
  }
  const storyteller = currentStoryteller(room);
  if (storyteller.id === playerId) {
    throw new GameError("語り手はすでにカードを提出済みです");
  }
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("プレイヤーが見つかりません");
  if (!player.hand.includes(cardId)) {
    throw new GameError("そのカードは手札にありません");
  }
  if (room.submissions.some((s) => s.playerId === playerId)) {
    throw new GameError("すでに提出済みです");
  }

  const players = room.players.map((p) =>
    p.id === playerId ? { ...p, hand: p.hand.filter((c) => c !== cardId) } : p
  );
  const submissions = [...room.submissions, { playerId, cardId }];

  const allSubmitted = submissions.length === room.players.length;

  let revealOrder: CardId[] = room.revealOrder;
  let phase: RoomState["phase"] = room.phase;
  if (allSubmitted) {
    revealOrder = shuffle(submissions.map((s) => s.cardId));
    phase = "vote";
  }

  return { ...room, players, submissions, revealOrder, phase };
}

export function submitVote(room: RoomState, playerId: string, votedCardId: CardId): RoomState {
  if (room.phase !== "vote") {
    throw new GameError("投票する局面ではありません");
  }
  const storyteller = currentStoryteller(room);
  if (storyteller.id === playerId) {
    throw new GameError("語り手は投票できません");
  }
  if (room.votes.some((v) => v.playerId === playerId)) {
    throw new GameError("すでに投票済みです");
  }
  const ownSubmission = room.submissions.find((s) => s.playerId === playerId);
  if (ownSubmission?.cardId === votedCardId) {
    throw new GameError("自分のカードには投票できません");
  }
  if (!room.revealOrder.includes(votedCardId)) {
    throw new GameError("無効なカードです");
  }

  const votes: Vote[] = [...room.votes, { playerId, votedCardId }];
  const expectedVotes = room.players.length - 1; // everyone but storyteller

  if (votes.length < expectedVotes) {
    return { ...room, votes };
  }

  return scoreRound({ ...room, votes });
}

function scoreRound(room: RoomState): RoomState {
  const storyteller = currentStoryteller(room);
  const storytellerSubmission = room.submissions.find((s) => s.playerId === storyteller.id)!;
  const storytellerCardId = storytellerSubmission.cardId;

  const correctVoters = room.votes.filter((v) => v.votedCardId === storytellerCardId);
  const everyoneOrNoOneCorrect =
    correctVoters.length === 0 || correctVoters.length === room.players.length - 1;

  const scoreDeltas: Record<string, number> = {};
  for (const p of room.players) scoreDeltas[p.id] = 0;

  if (everyoneOrNoOneCorrect) {
    for (const p of room.players) {
      if (p.id !== storyteller.id) scoreDeltas[p.id] += 2;
    }
  } else {
    scoreDeltas[storyteller.id] += 3;
    for (const v of correctVoters) {
      scoreDeltas[v.playerId] += 3;
    }
  }

  // +1 per vote received, for every non-storyteller card
  const votesByCard = new Map<CardId, number>();
  for (const v of room.votes) {
    votesByCard.set(v.votedCardId, (votesByCard.get(v.votedCardId) ?? 0) + 1);
  }
  for (const s of room.submissions) {
    if (s.playerId === storyteller.id) continue;
    const received = votesByCard.get(s.cardId) ?? 0;
    scoreDeltas[s.playerId] += received;
  }

  const players = room.players.map((p) => ({ ...p, score: p.score + scoreDeltas[p.id] }));

  const revealed: RevealedCard[] = room.submissions.map((s) => ({
    cardId: s.cardId,
    ownerId: s.playerId,
  }));

  const result: RoundResult = {
    round: room.round,
    storytellerId: storyteller.id,
    clue: room.clue ?? "",
    storytellerCardId,
    revealed,
    votes: room.votes,
    scoreDeltas,
    everyoneOrNoOneCorrect,
  };

  return {
    ...room,
    players,
    phase: "reveal",
    lastRoundResult: result,
  };
}

export function nextRound(room: RoomState, requesterId: string): RoomState {
  if (room.phase !== "reveal") {
    throw new GameError("結果発表中ではありません");
  }
  const requester = room.players.find((p) => p.id === requesterId);
  if (!requester?.isHost) {
    throw new GameError("ホストのみが次のラウンドに進められます");
  }

  const maxScore = Math.max(...room.players.map((p) => p.score));
  const deckExhausted = room.deck.length < room.players.length;

  if (maxScore >= room.maxScore || deckExhausted) {
    const winnerIds = room.players.filter((p) => p.score === maxScore).map((p) => p.id);
    return { ...room, phase: "gameover", winnerIds };
  }

  const deck = room.deck.slice();
  const players = room.players.map((p) => {
    const needed = room.handSize - p.hand.length;
    const draw = deck.splice(0, Math.max(0, needed));
    return { ...p, hand: [...p.hand, ...draw] };
  });

  return {
    ...room,
    players,
    deck,
    phase: "clue",
    storytellerIndex: (room.storytellerIndex + 1) % room.players.length,
    round: room.round + 1,
    clue: null,
    submissions: [],
    votes: [],
    revealOrder: [],
  };
}

export function sanitizeForPlayer(room: RoomState, viewerId: string): RoomState {
  const isVoteOrLaterPhase = room.phase === "vote" || room.phase === "reveal" || room.phase === "gameover";
  return {
    ...room,
    players: room.players.map((p) =>
      p.id === viewerId ? p : { ...p, hand: p.hand.map(() => -1) }
    ),
    submissions: isVoteOrLaterPhase
      ? room.submissions
      : room.submissions.map((s) => ({ ...s, cardId: s.playerId === viewerId ? s.cardId : -1 })),
    deck: [], // never leak deck order/contents
  };
}
