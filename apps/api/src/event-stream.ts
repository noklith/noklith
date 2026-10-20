import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './database.ts';
import { APIProblem } from './errors.ts';
import { USER_EVENTS_CHANNEL } from './service.ts';

interface Socket {
  readyState: number;
  send(data: string): void;
  ping(): void;
  close(code?: number, reason?: string): void;
  on(event: 'close' | 'message', listener: (...args: unknown[]) => void): void;
}
export interface EventStreamOptions {
  /** Session re-check interval; an expired or revoked session closes the socket with 4401. */
  revalidateMs?: number;
  pingMs?: number;
  maxSocketsPerUser?: number;
}
const OPEN = 1;

/**
 * WebSocket change signals on top of the user event feed. The socket only says "something changed";
 * clients fetch GET /v1/events?after=<seq> and REST state, so a missed signal costs nothing.
 * Signals come from PostgreSQL NOTIFY, which is delivered only after the change commits.
 */
export async function registerEventStream(app: FastifyInstance, db: Database, owner: (request: FastifyRequest) => Promise<string>,
  latestSeq: (ownerID: string) => Promise<string>, options: EventStreamOptions = {}) {
  const revalidateMs = options.revalidateMs ?? 60_000;
  const pingMs = options.pingMs ?? 25_000;
  const maxSockets = options.maxSocketsPerUser ?? 5;
  const subscribers = new Map<string, Set<Socket>>();
  let unlisten: (() => Promise<void>) | undefined;

  await app.register(websocket, { options: { maxPayload: 1024 } });
  app.addHook('onReady', async () => {
    unlisten = await db.listen(USER_EVENTS_CHANNEL, ownerID => {
      for (const socket of subscribers.get(ownerID) ?? []) if (socket.readyState === OPEN) socket.send(JSON.stringify({ type: 'changed' }));
    });
  });
  app.addHook('preClose', async () => {
    for (const sockets of subscribers.values()) for (const socket of sockets) socket.close(1001, 'server_shutdown');
  });
  // The database may already be closed during shutdown; there is nothing left to unsubscribe then.
  app.addHook('onClose', async () => { try { await unlisten?.(); } catch { /* already closed */ } });

  const owners = new WeakMap<FastifyRequest, string>();
  app.get('/v1/events/stream', {
    websocket: true,
    // Authentication happens before the upgrade, so a bad session gets an ordinary HTTP 401.
    preValidation: async request => { owners.set(request, await owner(request)); },
  }, (rawSocket, request) => {
    const socket = rawSocket as unknown as Socket;
    const ownerID = owners.get(request);
    if (!ownerID) { socket.close(4401, 'unauthorized'); return; }
    const sockets = subscribers.get(ownerID) ?? new Set<Socket>();
    if (sockets.size >= maxSockets) { socket.close(4429, 'too_many_connections'); return; }
    sockets.add(socket);
    subscribers.set(ownerID, sockets);
    void latestSeq(ownerID).then(seq => { if (socket.readyState === OPEN) socket.send(JSON.stringify({ type: 'ready', latest_seq: seq })); }, () => {});
    const ping = setInterval(() => { if (socket.readyState === OPEN) socket.ping(); }, pingMs);
    const revalidate = setInterval(async () => {
      try {
        if (await owner(request) !== ownerID) throw new APIProblem(401, 'session_changed', 'Session changed.');
      } catch { socket.close(4401, 'session_expired'); }
    }, revalidateMs);
    // Clients have nothing to say on this channel.
    socket.on('message', () => socket.close(4400, 'unexpected_message'));
    socket.on('close', () => {
      clearInterval(ping);
      clearInterval(revalidate);
      sockets.delete(socket);
      if (!sockets.size) subscribers.delete(ownerID);
    });
  });
}
