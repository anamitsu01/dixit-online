import type { CardId } from "./types";

// Deterministic PRNG (mulberry32) so every client renders the identical
// placeholder artwork for a given card id without sending image data.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(cardId: CardId): number {
  return (cardId * 2654435761) ^ 0x9e3779b9;
}

const PALETTES: [string, string, string][] = [
  ["#2b1055", "#7597de", "#ffd6ec"], // twilight
  ["#0f2027", "#2c5364", "#a8e6cf"], // deep sea
  ["#3a1c71", "#d76d77", "#ffaf7b"], // sunset
  ["#1a2980", "#26d0ce", "#f6f1e7"], // aurora
  ["#5f0a87", "#a4508b", "#f9d423"], // dream haze
  ["#134e5e", "#71b280", "#eaf4d3"], // forest mist
  ["#000428", "#004e92", "#e6f7ff"], // midnight
  ["#42275a", "#734b6d", "#ffe6a7"], // dusk
  ["#232526", "#414345", "#ffd89b"], // ember
  ["#6a3093", "#a044ff", "#e8f5ff"], // violet dream
];

export interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  color: string;
  opacity: number;
}

export interface Accent {
  kind: "circle" | "ring" | "star" | "wave";
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
}

export interface CardArtSpec {
  seed: number;
  bgFrom: string;
  bgMid: string;
  bgTo: string;
  angle: number;
  blobs: Blob[];
  accents: Accent[];
}

export function generateCardArt(cardId: CardId): CardArtSpec {
  const rand = mulberry32(hashSeed(cardId));
  const palette = PALETTES[Math.floor(rand() * PALETTES.length) % PALETTES.length];
  const [bgFrom, bgMid, bgTo] = palette;
  const angle = Math.floor(rand() * 360);

  const blobCount = 4 + Math.floor(rand() * 4); // 4-7
  const blobs: Blob[] = Array.from({ length: blobCount }).map(() => ({
    cx: rand() * 100,
    cy: rand() * 140,
    rx: 12 + rand() * 30,
    ry: 8 + rand() * 24,
    rotate: rand() * 360,
    color: palette[Math.floor(rand() * palette.length)],
    opacity: 0.18 + rand() * 0.28,
  }));

  const accentCount = 1 + Math.floor(rand() * 3);
  const accentKinds: Accent["kind"][] = ["circle", "ring", "star", "wave"];
  const accents: Accent[] = Array.from({ length: accentCount }).map(() => ({
    kind: accentKinds[Math.floor(rand() * accentKinds.length)],
    cx: rand() * 100,
    cy: rand() * 140,
    r: 3 + rand() * 10,
    color: "#ffffff",
    opacity: 0.35 + rand() * 0.4,
  }));

  return { seed: hashSeed(cardId), bgFrom, bgMid, bgTo, angle, blobs, accents };
}
