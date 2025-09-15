export interface Position {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface GameConfig {
  width: number;
  height: number;
  initialSpeed: number;
  speedIncrement: number;
}

export interface GameState {
  snake: Position[];
  food: Position;
  direction: Direction;
  score: number;
  gameOver: boolean;
  speed: number;
}

export interface GameActions {
  changeDirection: (direction: Direction) => void;
  tick: () => void;
  reset: () => void;
}