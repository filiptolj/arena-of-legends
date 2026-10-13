import './style.css';
import { Game } from './game';
import { LocalSession, type Session } from './session';
import { showMainMenu } from './ui/menu';

const hud = document.getElementById('hud')!;
showMainMenu(hud).then(async (choice) => {
  const session: Session = choice.kind === 'local' ? new LocalSession(choice.champion) : choice.session;
  if (choice.kind === 'online') await choice.session.ready;
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
