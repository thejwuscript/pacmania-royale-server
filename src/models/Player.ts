import type { User } from "./User";

export interface Player extends User {
  position: {
    x: number;
    y: number;
  } | null;
  color: string;
  score: number;
  gainedPower: boolean;
  gameroom: string; // reference to Gameroom
}

export const players = new Map<string, Player>();
