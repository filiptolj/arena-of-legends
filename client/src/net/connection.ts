import type { ClientMessage, ServerMessage } from '@lol/shared';

type Handler = (msg: ServerMessage) => void;

/** Thin WebSocket wrapper speaking the shared JSON protocol. */
export class Connection {
  private readonly handlers = new Set<Handler>();
  private readonly closeHandlers = new Set<() => void>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      for (const h of [...this.handlers]) h(msg);
    });
    ws.addEventListener('close', () => {
      for (const h of this.closeHandlers) h();
    });
  }

  /** Connects to the game server on the same host (Vite proxies /ws in development). */
  static open(): Promise<Connection> {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Connection(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error('Could not reach the game server. Is it running? (npm run dev:server)')), {
        once: true,
      });
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Subscribes to server messages; returns an unsubscribe function. */
  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }
}
