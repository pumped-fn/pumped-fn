import { derive, name } from '@pumped-fn/core-next';
import { gameController } from './game-logic.js';
import { gameState } from './game-state.js';

// Game loop with render callback support
const gameLoop = derive(
  [gameController, gameState.static],
  ([controller, stateAccessor], ctl) => {
    let gameInterval: NodeJS.Timeout | null = null;
    let currentSpeed = 0;
    let renderCallback: (() => void) | null = null;

    const updateGameSpeed = (newSpeed: number) => {
      if (currentSpeed === newSpeed) return;

      if (gameInterval) {
        clearInterval(gameInterval);
      }

      gameInterval = setInterval(() => {
        controller.tick();
        // Render after each tick if callback is set
        if (renderCallback) {
          renderCallback();
        }
      }, newSpeed);

      currentSpeed = newSpeed;
    };

    const startGame = (onRender?: () => void) => {
      renderCallback = onRender || null;

      // Initial render
      if (renderCallback) {
        renderCallback();
      }

      // Start game loop with initial speed
      const currentState = stateAccessor.get();
      updateGameSpeed(currentState.speed);

      // Monitor for speed changes
      const speedCheckInterval = setInterval(() => {
        const state = stateAccessor.get();
        if (state.speed !== currentSpeed) {
          updateGameSpeed(state.speed);
        }
      }, 100);

      ctl.cleanup(() => clearInterval(speedCheckInterval));
    };

    const stopGame = () => {
      if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
      }
    };

    const cleanup = () => {
      stopGame();
    };

    ctl.cleanup(cleanup);

    return { startGame, stopGame };
  },
  name('game-loop')
);

export { gameLoop };