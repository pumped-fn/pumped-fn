import { provide, derive, name } from '@pumped-fn/core-next';
import type { GameConfig, GameState, Position, Direction } from './types.js';

// Game configuration
const config = provide(() => ({
  width: 30,
  height: 15,
  initialSpeed: 200,
  speedIncrement: 10
}), name('config'));

// Initial game state
const initialGameState = provide(() => ({
  snake: [{ x: 10, y: 10 }],
  food: { x: 15, y: 15 },
  direction: 'right' as Direction,
  score: 0,
  gameOver: false,
  speed: 200
}), name('initial-game-state'));

// Game state with programmatic updates
const gameState = provide(() => {
  const initialState: GameState = {
    snake: [{ x: 5, y: 7 }],
    food: { x: 15, y: 7 },
    direction: 'right' as Direction,
    score: 0,
    gameOver: false,
    speed: 200
  };
  return initialState;
}, name('game-state'));

export { config, gameState };