export type CardId = number;

export type GamePhase =
  | "lobby"
  | "clue"
  | "submit"
  | "vote"
  | "reveal"
  | "gameover";

export interface Player {
  id: string;
  name: string;
  hand: CardId[];
  score: number;
  connected: boolean;
  isHost: boolean;
}

export interface Submission {
  playerId: string;
  cardId: CardId;
}

export interface Vote {
  playerId: string;
  votedCardId: CardId;
}

export interface RevealedCard {
  cardId: CardId;
  ownerId: string;
}

export interface RoundResult {
  round: number;
  storytellerId: string;
  clue: string;
  storytellerCardId: CardId;
  revealed: RevealedCard[];
  votes: Vote[];
  scoreDeltas: Record<string, number>;
  everyoneOrNoOneCorrect: boolean;
}

export interface RoomState {
  code: string;
  phase: GamePhase;
  players: Player[];
  deck: CardId[];
  storytellerIndex: number;
  round: number;
  clue: string | null;
  submissions: Submission[];
  votes: Vote[];
  revealOrder: CardId[];
  lastRoundResult: RoundResult | null;
  winnerIds: string[];
  maxScore: number;
  handSize: number;
  createdAt: number;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const HAND_SIZE = 6;
export const WINNING_SCORE = 30;
export const DECK_SIZE = 84;
