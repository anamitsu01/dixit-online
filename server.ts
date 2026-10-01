import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  addBotPlayers,
  addPlayer,
  createRoom,
  GameError,
  markConnection,
  nextRound,
  playAgain,
  removePlayer,
  sanitizeForPlayer,
  startGame,
  submitCard,
  submitClue,
  submitVote,
} from "./lib/gameEngine";
import { getRoom, pruneStaleRooms, reserveUniqueCode, saveRoom } from "./lib/rooms";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  SocketResult,
} from "./lib/socketEvents";
import type { CardId, RoomState } from "./lib/types";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";
const LOBBY_DISCONNECT_GRACE_MS = Number(process.env.LOBBY_DISCONNECT_GRACE_MS) || 20_000;

// Magic room code: joining it (re)creates a fresh lobby seeded with bots, so
// a single tester can reach the minimum player count without juggling extra
// browser tabs or terminal windows.
const BOT_TEST_ROOM_CODE = "ZZZZZ";
const BOT_COUNT = 3;
const BOT_MIN_DELAY_MS = 600;
const BOT_MAX_DELAY_MS = 1800;
const BOT_CLUES = [
  "なんとなく",
  "思い出の一コマ",
  "静かな午後",
  "遠い記憶",
  "小さな奇跡",
  "夢の続き",
  "あの日の空気",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function ok<T>(data: T): SocketResult<T> {
  return { ok: true, data };
}
function fail<T>(error: string): SocketResult<T> {
  return { ok: false, error };
}

function broadcastRoom(io: Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>, room: RoomState) {
  saveRoom(room);
  for (const player of room.players) {
    io.to(playerRoomTag(room.code, player.id)).emit("room:update", sanitizeForPlayer(room, player.id));
  }
}

function roomTag(code: string) {
  return `room:${code}`;
}
function playerRoomTag(code: string, playerId: string) {
  return `room:${code}:player:${playerId}`;
}

type Io = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

// Applies a mutation to a room (if it still exists), broadcasts the result,
// and lets bots react to the new state. Shared by real player actions and
// bot-triggered ones so both paths stay in sync.
function applyMutation(io: Io, code: string, mutate: (room: RoomState) => RoomState): RoomState | null {
  const room = getRoom(code);
  if (!room) return null;
  const updated = mutate(room);
  broadcastRoom(io, updated);
  scheduleBotActions(io, updated);
  return updated;
}

function scheduleBotAction(roomCode: string, act: () => void) {
  const delay = BOT_MIN_DELAY_MS + Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
  setTimeout(() => {
    try {
      act();
    } catch {
      // Stale state by the time this fired (phase moved on, already acted,
      // room gone) - harmless, just skip.
    }
  }, delay);
}

// Looks at the current phase and has any bot whose turn it is act, after a
// short human-like delay. Re-entrant: called again after every mutation
// (including bot-triggered ones) so it naturally chains through a round.
function scheduleBotActions(io: Io, room: RoomState) {
  const storyteller = room.players[room.storytellerIndex];

  if (room.phase === "clue" && storyteller?.isBot && storyteller.hand.length > 0) {
    const cardId = randomFrom(storyteller.hand);
    const clue = randomFrom(BOT_CLUES);
    scheduleBotAction(room.code, () => {
      applyMutation(io, room.code, (r) => submitClue(r, storyteller.id, cardId, clue));
    });
    return;
  }

  if (room.phase === "submit") {
    for (const p of room.players) {
      if (!p.isBot || p.id === storyteller?.id) continue;
      if (room.submissions.some((s) => s.playerId === p.id) || p.hand.length === 0) continue;
      const cardId = randomFrom(p.hand);
      scheduleBotAction(room.code, () => {
        applyMutation(io, room.code, (r) => submitCard(r, p.id, cardId));
      });
    }
    return;
  }

  if (room.phase === "vote") {
    for (const p of room.players) {
      if (!p.isBot || p.id === storyteller?.id) continue;
      if (room.votes.some((v) => v.playerId === p.id)) continue;
      const mySubmission = room.submissions.find((s) => s.playerId === p.id);
      const options = room.revealOrder.filter((cardId) => cardId !== mySubmission?.cardId);
      if (options.length === 0) continue;
      const cardId: CardId = randomFrom(options);
      scheduleBotAction(room.code, () => {
        applyMutation(io, room.code, (r) => submitVote(r, p.id, cardId));
      });
    }
  }

  // "reveal" / "gameover": pacing stays in the (human) host's hands.
}

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
    cors: { origin: "*" },
  });

  setInterval(pruneStaleRooms, 30 * 60 * 1000).unref();

  io.on("connection", (socket) => {
    socket.on("room:create", ({ name }, cb) => {
      try {
        const trimmed = (name ?? "").trim().slice(0, 24) || "プレイヤー";
        const room = reserveUniqueCode(() => createRoom(socket.id, trimmed));
        socket.data.playerId = socket.id;
        socket.data.roomCode = room.code;
        socket.join(roomTag(room.code));
        socket.join(playerRoomTag(room.code, socket.id));
        saveRoom(room);
        cb(ok({ room: sanitizeForPlayer(room, socket.id), playerId: socket.id }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    socket.on("room:join", ({ code, name }, cb) => {
      try {
        const trimmed = (name ?? "").trim().slice(0, 24) || "プレイヤー";
        const normalizedCode = code.trim().toUpperCase();
        let room = getRoom(normalizedCode);

        let updated: RoomState;
        if (normalizedCode === BOT_TEST_ROOM_CODE && (!room || room.phase !== "lobby")) {
          // Magic test room: always (re)start as a fresh lobby with this
          // player as host plus bots, so the minimum player count is met
          // without recruiting real people.
          room = createRoom(socket.id, trimmed, BOT_TEST_ROOM_CODE);
          updated = addBotPlayers(room, BOT_COUNT);
        } else {
          if (!room) throw new GameError("部屋が見つかりません");
          updated = addPlayer(room, socket.id, trimmed);
        }

        socket.data.playerId = socket.id;
        socket.data.roomCode = updated.code;
        socket.join(roomTag(updated.code));
        socket.join(playerRoomTag(updated.code, socket.id));
        broadcastRoom(io, updated);
        cb(ok({ room: sanitizeForPlayer(updated, socket.id), playerId: socket.id }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    socket.on("room:rejoin", ({ code, playerId }, cb) => {
      try {
        const room = getRoom(code);
        if (!room) throw new GameError("部屋が見つかりません");
        if (!room.players.some((p) => p.id === playerId)) {
          throw new GameError("このプレイヤーは部屋にいません");
        }
        const updated = markConnection(room, playerId, true);
        socket.data.playerId = playerId;
        socket.data.roomCode = updated.code;
        socket.join(roomTag(updated.code));
        socket.join(playerRoomTag(updated.code, playerId));
        broadcastRoom(io, updated);
        cb(ok({ room: sanitizeForPlayer(updated, playerId) }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    function withRoom(
      code: string,
      mutate: (room: RoomState) => RoomState,
      cb: (res: SocketResult<null>) => void
    ) {
      try {
        const updated = applyMutation(io, code, mutate);
        if (!updated) throw new GameError("部屋が見つかりません");
        cb(ok(null));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    }

    socket.on("room:start", ({ code }, cb) => {
      withRoom(code, (room) => startGame(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("game:submitClue", ({ code, cardId, clue }, cb) => {
      withRoom(code, (room) => submitClue(room, socket.data.playerId ?? socket.id, cardId, clue), cb);
    });

    socket.on("game:submitCard", ({ code, cardId }, cb) => {
      withRoom(code, (room) => submitCard(room, socket.data.playerId ?? socket.id, cardId), cb);
    });

    socket.on("game:submitVote", ({ code, cardId }, cb) => {
      withRoom(code, (room) => submitVote(room, socket.data.playerId ?? socket.id, cardId), cb);
    });

    socket.on("game:nextRound", ({ code }, cb) => {
      withRoom(code, (room) => nextRound(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("game:playAgain", ({ code }, cb) => {
      withRoom(code, (room) => playAgain(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("disconnect", () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = getRoom(roomCode);
      if (!room) return;

      const updated = markConnection(room, playerId, false);
      broadcastRoom(io, updated);

      if (room.phase === "lobby") {
        // Mobile browsers routinely drop the socket for a few seconds when a
        // tab is backgrounded (e.g. switching apps to share the room code).
        // Give reconnects a grace period before actually dropping the seat,
        // instead of removing them immediately and possibly losing the host.
        setTimeout(() => {
          const latest = getRoom(roomCode);
          if (!latest || latest.phase !== "lobby") return;
          const player = latest.players.find((p) => p.id === playerId);
          if (!player || player.connected) return;
          broadcastRoom(io, removePlayer(latest, playerId));
        }, LOBBY_DISCONNECT_GRACE_MS);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Dixit Online ready on http://${hostname}:${port}`);
  });
});
