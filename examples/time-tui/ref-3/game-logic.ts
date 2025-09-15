import { derive, name } from '@pumped-fn/core-next';
import { config, gameState } from './game-state.js';
import type { Position, Direction, GameState, GameActions } from './types.js';

// Utility functions
function generateRandomFood(width: number, height: number, snake: Position[]): Position {
  let food: Position;
  do {
    food = {
      x: Math.floor(Math.random() * width),
      y: Math.floor(Math.random() * height)
    };
  } while (snake.some(segment => segment.x === food.x && segment.y === food.y));
  return food;
}

function moveSnake(snake: Position[], direction: Direction): Position[] {
  const head = { ...snake[0] };

  switch (direction) {
    case 'up':
      head.y -= 1;
      break;
    case 'down':
      head.y += 1;
      break;
    case 'left':
      head.x -= 1;
      break;
    case 'right':
      head.x += 1;
      break;
  }

  return [head, ...snake];
}

function checkCollision(head: Position, snake: Position[], width: number, height: number): boolean {
  // Wall collision
  if (head.x < 0 || head.x >= width || head.y < 0 || head.y >= height) {
    return true;
  }

  // Self collision
  return snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y);
}

function isOppositeDirection(current: Direction, new_direction: Direction): boolean {
  const opposites = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left'
  };
  return opposites[current] === new_direction;
}

// Game controller with state management
const gameController = derive(
  [config, gameState.static],
  ([cfg, stateAccessor], ctl) => {
    const actions: GameActions = {
      changeDirection: (direction: Direction) => {
        stateAccessor.update(currentState => {
          if (currentState.gameOver || isOppositeDirection(currentState.direction, direction)) {
            return currentState;
          }
          return { ...currentState, direction };
        });
      },

      tick: () => {
        stateAccessor.update(currentState => {
          if (currentState.gameOver) {
            return currentState;
          }

          const newSnake = moveSnake(currentState.snake, currentState.direction);
          const head = newSnake[0];

          // Check collision
          if (checkCollision(head, currentState.snake, cfg.width, cfg.height)) {
            return { ...currentState, gameOver: true };
          }

          // Check food consumption
          let updatedSnake = newSnake;
          let newFood = currentState.food;
          let newScore = currentState.score;
          let newSpeed = currentState.speed;

          if (head.x === currentState.food.x && head.y === currentState.food.y) {
            // Snake ate food - don't remove tail
            newFood = generateRandomFood(cfg.width, cfg.height, updatedSnake);
            newScore += 10;
            newSpeed = Math.max(50, currentState.speed - cfg.speedIncrement);
          } else {
            // Normal movement - remove tail
            updatedSnake = newSnake.slice(0, -1);
          }

          return {
            ...currentState,
            snake: updatedSnake,
            food: newFood,
            score: newScore,
            speed: newSpeed
          };
        });
      },

      reset: () => {
        stateAccessor.update(() => ({
          snake: [{ x: 5, y: 7 }],
          food: generateRandomFood(cfg.width, cfg.height, [{ x: 5, y: 7 }]),
          direction: 'right' as Direction,
          score: 0,
          gameOver: false,
          speed: cfg.initialSpeed
        }));
      }
    };

    return actions;
  },
  name('game-controller')
);

export { gameController };