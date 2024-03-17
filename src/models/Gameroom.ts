interface Gameroom {
  id: string;
  maxPlayerCount: number;
  host: string;
  roundCount: number;
  fruitPlaced?: boolean;
}

export const gamerooms: { [key: string]: Gameroom } = {};