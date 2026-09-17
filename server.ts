import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  addPlayer,
  createRoom,
  GameError,
  markConnection,
  nextRound,
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
import type { RoomState } from "./lib/types";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";

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
        const room = getRoom(code);
        if (!room) throw new GameError("部屋が見つかりません");
        const updated = addPlayer(room, socket.id, trimmed);
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
        const room = getRoom(code);
        if (!room) throw new GameError("部屋が見つかりません");
        const updated = mutate(room);
        broadcastRoom(io, updated);
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

    socket.on("disconnect", () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = getRoom(roomCode);
      if (!room) return;
      if (room.phase === "lobby") {
        const updated = removePlayer(room, playerId);
        broadcastRoom(io, updated);
      } else {
        const updated = markConnection(room, playerId, false);
        broadcastRoom(io, updated);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Dixit Online ready on http://${hostname}:${port}`);
  });
});
