// Test helper: joins an existing room as an automated player and plays
// along (random clue / card / vote) so you can test with fewer humans.
//
// Usage:
//   node scripts/bot.mjs <roomCode> [name] [serverUrl]
//
// Examples:
//   node scripts/bot.mjs ABCDE
//   node scripts/bot.mjs ABCDE "Bot1"
//   node scripts/bot.mjs ABCDE "Bot1" https://dixit-online-production.up.railway.app
import { io } from "socket.io-client";

const [, , roomCode, nameArg, serverUrlArg] = process.argv;

if (!roomCode) {
  console.error("Usage: node scripts/bot.mjs <roomCode> [name] [serverUrl]");
  process.exit(1);
}

const serverUrl = serverUrlArg || process.env.DIXIT_SERVER_URL || "http://localhost:3000";
const botName = nameArg || `Bot${Math.floor(Math.random() * 1000)}`;
const CLUES = [
  "なんとなく",
  "思い出の一コマ",
  "静かな午後",
  "遠い記憶",
  "小さな奇跡",
  "夢の続き",
  "あの日の空気",
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const socket = io(serverUrl, { transports: ["websocket", "polling"] });

let playerId = null;
const actedKeys = new Set();

socket.on("connect_error", (err) => {
  console.error(`[${botName}] connection error:`, err.message);
});

socket.on("connect", () => {
  socket.emit("room:join", { code: roomCode, name: botName }, (res) => {
    if (!res.ok) {
      console.error(`[${botName}] failed to join room ${roomCode}:`, res.error);
      process.exit(1);
    }
    playerId = res.data.playerId;
    console.log(`[${botName}] joined room ${roomCode}`);
  });
});

socket.on("room:error", (message) => {
  console.error(`[${botName}] error:`, message);
});

socket.on("room:update", async (room) => {
  if (!playerId) return;
  const me = room.players.find((p) => p.id === playerId);
  if (!me) return;

  const key = `${room.round}:${room.phase}`;
  if (actedKeys.has(key)) return;

  const isStoryteller = room.players[room.storytellerIndex]?.id === playerId;

  if (room.phase === "clue" && isStoryteller && me.hand.length > 0) {
    actedKeys.add(key);
    await delay(400 + Math.random() * 800);
    const cardId = randomFrom(me.hand);
    const clue = randomFrom(CLUES);
    socket.emit("game:submitClue", { code: roomCode, cardId, clue }, (res) => {
      if (res.ok) console.log(`[${botName}] お題「${clue}」を出しました`);
      else actedKeys.delete(key);
    });
    return;
  }

  if (room.phase === "submit" && !isStoryteller) {
    const already = room.submissions.some((s) => s.playerId === playerId);
    if (!already && me.hand.length > 0) {
      actedKeys.add(key);
      await delay(400 + Math.random() * 1200);
      const cardId = randomFrom(me.hand);
      socket.emit("game:submitCard", { code: roomCode, cardId }, (res) => {
        if (res.ok) console.log(`[${botName}] カードを提出しました`);
        else actedKeys.delete(key);
      });
    }
    return;
  }

  if (room.phase === "vote" && !isStoryteller) {
    const already = room.votes.some((v) => v.playerId === playerId);
    const mySubmission = room.submissions.find((s) => s.playerId === playerId);
    if (!already && room.revealOrder?.length > 0) {
      const options = room.revealOrder.filter((cardId) => cardId !== mySubmission?.cardId);
      if (options.length > 0) {
        actedKeys.add(key);
        await delay(400 + Math.random() * 1200);
        const cardId = randomFrom(options);
        socket.emit("game:submitVote", { code: roomCode, cardId }, (res) => {
          if (res.ok) console.log(`[${botName}] 投票しました`);
          else actedKeys.delete(key);
        });
      }
    }
  }
});

process.on("SIGINT", () => {
  socket.disconnect();
  process.exit(0);
});

console.log(`[${botName}] connecting to ${serverUrl} ...`);
