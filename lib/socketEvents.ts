import type { CardId, RoomState } from "./types";

// Client -> server
export interface ClientToServerEvents {
  "room:create": (payload: { name: string }, cb: (res: SocketResult<{ room: RoomState; playerId: string }>) => void) => void;
  "room:join": (payload: { code: string; name: string }, cb: (res: SocketResult<{ room: RoomState; playerId: string }>) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: string }, cb: (res: SocketResult<{ room: RoomState }>) => void) => void;
  "room:start": (payload: { code: string }, cb: (res: SocketResult<null>) => void) => void;
  "game:submitClue": (payload: { code: string; cardId: CardId; clue: string }, cb: (res: SocketResult<null>) => void) => void;
  "game:submitCard": (payload: { code: string; cardId: CardId }, cb: (res: SocketResult<null>) => void) => void;
  "game:submitVote": (payload: { code: string; cardId: CardId }, cb: (res: SocketResult<null>) => void) => void;
  "game:nextRound": (payload: { code: string }, cb: (res: SocketResult<null>) => void) => void;
}

// server -> client
export interface ServerToClientEvents {
  "room:update": (room: RoomState) => void;
  "room:error": (message: string) => void;
  "room:closed": () => void;
}

export type SocketResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SocketData {
  playerId?: string;
  roomCode?: string;
}
