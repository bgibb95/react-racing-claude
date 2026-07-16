import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initGamepad } from './game/gamepad';

// Start polling the Gamepad API for the lifetime of the page. The polling
// loop is cheap (one rAF tick) and survives across race screens, so we kick
// it off here at app boot rather than inside the Phaser scene.
initGamepad();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
