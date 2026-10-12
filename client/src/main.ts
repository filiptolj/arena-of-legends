import './style.css';
import { Game } from './game';
import { showChampionSelect } from './ui/select';

const hud = document.getElementById('hud')!;
showChampionSelect(hud).then((championId) => {
  const game = new Game(
    document.getElementById('scene') as HTMLCanvasElement,
    document.getElementById('world-overlay')!,
    hud,
    championId,
  );
  game.start();
  // Handy for poking at the simulation from the browser console during development.
  if (import.meta.env.DEV) Object.assign(window, { game });
});
