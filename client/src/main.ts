import './style.css';
import { Game } from './game';
import { loadCharacters } from './render/characters';
import { LocalSession, type Session } from './session';
import { showMainMenu } from './ui/menu';

const hud = document.getElementById('hud')!;
// The game uses right-click everywhere (HUD included); never show the browser's context menu.
window.addEventListener('contextmenu', (e) => e.preventDefault());
// Start downloading the character models while the player is in the menus.
const characters = loadCharacters();

showMainMenu(hud).then(async (choice) => {
  const session: Session = choice.kind === 'local' ? new LocalSession(choice.champion) : choice.session;
  const loading = document.createElement('div');
  loading.className = 'select-screen';
  loading.innerHTML = '<p class="subtitle">Loading champions…</p>';
  hud.appendChild(loading);
  await characters;
  if (choice.kind === 'online') await choice.session.ready;
  loading.remove();
  const game = new Game(
    document.getElementById('scene') as HTMLCanvasElement,
    document.getElementById('world-overlay')!,
    hud,
    session,
  );
  game.start();
  // Handy for poking at the game from the browser console during development.
  if (import.meta.env.DEV) Object.assign(window, { game, session });
});
