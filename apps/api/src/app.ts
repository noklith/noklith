import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import {
  cardParamsSchema, cardResponseSchema, configSchema, emptyBodySchema, errorSchema, historyQuerySchema,
  historyResponseSchema, idempotencyHeadersSchema, profileRequestSchema, sessionResponseSchema, userSchema,
  authChallengeRequestSchema, authChallengeResponseSchema, authVerifyRequestSchema, walletSessionResponseSchema, walletUserSchema,
  credentialsResponseSchema, eventsQuerySchema, eventsResponseSchema, limitsResponseSchema,
  cardEventResultSchema, demoCardEventRequestSchema, walletBalancesResponseSchema,
  topUpAcceptResponseSchema, topUpCreateRequestSchema, topUpHashRequestSchema, topUpListResponseSchema, topUpParamsSchema, topUpResponseSchema,
} from '../../../packages/api-contracts/src/index.ts';
import type { AuthChallengeRequest, AuthVerifyRequest, DemoCardEventRequest, FixtureProfile, NetworkMode, TopUpCreateRequest, TopUpHashRequest } from '../../../packages/api-contracts/src/index.ts';
import { publicConfig } from './config.ts';
import type { Database } from './database.ts';
import { APIProblem } from './errors.ts';
import { CardService } from './service.ts';
import { AuthService } from './auth/service.ts';
import type { AuthConfiguration, AuthDependencies } from './auth/service.ts';
import { AuthRateLimiter } from './auth/rate-limit.ts';
import type { CardIssuerAdapter } from './issuer/issuer.ts';
import { DemoIssuer } from './issuer/issuer.ts';
import { CardEventProcessor } from './issuer/events.ts';
import { LimitsService } from './limits.ts';
import { RiskService } from './risk.ts';
import { registerEventStream } from './event-stream.ts';
import type { EventStreamOptions } from './event-stream.ts';
import type { FundingService } from './funding/service.ts';

export interface AppOptions {
  db: Database; networkMode: NetworkMode; now?: () => Date; logger?: boolean;
  /** Git commit of the running release, shown at /version so the deployment can be matched to its source. */
  release?: string;
  auth?: { configuration: AuthConfiguration; dependencies: AuthDependencies };
  issuer?: CardIssuerAdapter;
  limits?: LimitsService;
  /** Testnet funding; requires wallet authentication. Absent means top-ups are disabled. */
  funding?: FundingService;
  risk?: RiskService;
  eventStream?: EventStreamOptions;
  /** Reverse proxy address or CIDR allowed to report the client IP in X-Forwarded-For. */
  trustedProxy?: string;
}
export function buildApp(options: AppOptions) {
  if (options.auth && options.networkMode === 'fixture') throw new Error('Wallet authentication cannot be enabled in fixture mode.');
  if (options.funding && !options.auth) throw new Error('Funding requires wallet authentication.');
  const authNow = options.auth?.dependencies.now ?? options.now;
  const auth = options.auth ? new AuthService(options.db, options.auth.configuration, { ...options.auth.dependencies, now: authNow }) : undefined;
  const limiter = auth ? new AuthRateLimiter(options.db, authNow) : undefined;
  const authMetadata = options.auth ? {
    origin: options.auth.configuration.origin, uri: options.auth.configuration.uri,
    chain_ids: [...new Set(options.auth.configuration.allowedChainIds)],
  } : null;
  const app = Fastify({
    logger: options.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] } : false,
    bodyLimit: 8192,
    trustProxy: options.trustedProxy ?? false,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  const issuer = options.issuer ?? new DemoIssuer();
  const limits = options.limits ?? new LimitsService();
  const service = new CardService(options.db, options.now, issuer, limits);
  const cardEvents = new CardEventProcessor(options.db, issuer, limits, options.now, options.risk ?? new RiskService(limits));
  const success = (schema: object) => ({ 200: schema, '4xx': errorSchema, '5xx': errorSchema });
  const user = async (request: FastifyRequest) => {
    if (options.networkMode === 'fixture') return service.authenticate(request.headers.authorization);
    if (!auth) throw new APIProblem(503, 'wallet_auth_unavailable', 'Wallet authentication is not configured.');
    return auth.authenticate(request.headers.authorization);
  };
  /** Card owner ID: the fixture user, or the app user bound to the signed-in wallet identity. */
  const cardUser = async (request: FastifyRequest): Promise<string> => {
    if (options.networkMode === 'fixture') return (await service.authenticate(request.headers.authorization)).id;
    if (!auth) throw new APIProblem(503, 'wallet_auth_unavailable', 'Wallet authentication is not configured.');
    return service.walletOwner((await auth.authenticate(request.headers.authorization)).id);
  };
  app.addHook('onSend', async (_request, reply) => { reply.header('cache-control', 'no-store'); reply.header('x-content-type-options', 'nosniff'); });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof APIProblem) {
      if (error.statusCode === 429) reply.header('retry-after', '60');
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, request_id: request.id } });
    }
    const errorStatus = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
    if (status === 500) request.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({ error: { code: status === 500 ? 'internal_error' : 'invalid_request',
      message: status === 500 ? 'The request could not be completed.' : 'The request does not match the API contract.', request_id: request.id } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Route not found.', request_id: request.id } }));
  app.get('/health', { schema: { response: success({ type: 'object', properties: { status: { const: 'ok' } }, required: ['status'], additionalProperties: false }) } }, async () => ({ status: 'ok' }));
  app.get('/version', { schema: { response: success({ type: 'object', properties: { commit: { type: ['string', 'null'] } }, required: ['commit'], additionalProperties: false }) } },
    async () => ({ commit: options.release ?? null }));
  app.get('/ready', { schema: { response: success({ type: 'object', properties: { status: { const: 'ready' } }, required: ['status'], additionalProperties: false }) } }, async () => {
    try {
      await options.db.query('SELECT name FROM schema_migrations LIMIT 1');
      if (auth) {
        const maintenance = await options.db.query('SELECT id FROM auth_maintenance WHERE id = 1');
        if (!maintenance.rows.length) throw new Error('Wallet authentication migrations are not ready.');
      }
    }
    catch { throw new APIProblem(503, 'database_unavailable', 'Database migrations are not ready.'); }
    return { status: 'ready' };
  });
  app.get('/v1/config', { schema: { response: success(configSchema) } }, async () => ({
    ...publicConfig(options.networkMode, limits.publicValues(), issuer.mode), wallet_auth_enabled: !!auth, wallet_auth: authMetadata,
    top_up_enabled: !!options.funding, networks: options.funding?.networks ?? [],
  }));
  if (options.networkMode === 'fixture') {
    app.post<{ Body: { profile: FixtureProfile } }>('/v1/fixture/sessions', {
      schema: { body: profileRequestSchema, response: success(sessionResponseSchema) },
    }, async request => service.createFixtureSession(request.body.profile));
  }
  if (auth && limiter) {
    app.post<{ Body: AuthChallengeRequest }>('/v1/auth/challenge', {
      schema: { body: authChallengeRequestSchema, response: success(authChallengeResponseSchema) },
      preValidation: async request => limiter.consume('challenge', request.ip, request.body?.address),
    }, async request => auth.createChallenge(request.body.address, request.body.chain_id));
    app.post<{ Body: AuthVerifyRequest }>('/v1/auth/verify', {
      schema: { body: authVerifyRequestSchema, response: success(walletSessionResponseSchema) },
      preValidation: async request => limiter.consume('verify', request.ip, request.body?.challenge_id),
    }, async request => auth.verify({ challengeId: request.body.challenge_id, message: request.body.message, signature: request.body.signature }));
  }
  app.get('/v1/me', { schema: { response: success(options.networkMode === 'fixture' ? userSchema : walletUserSchema) } }, async request => user(request));
  app.post('/v1/auth/logout', { schema: { body: emptyBodySchema } }, async (request, reply) => {
    if (options.networkMode === 'fixture') await service.logout(request.headers.authorization);
    else if (auth) await auth.logout(request.headers.authorization);
    else throw new APIProblem(503, 'wallet_auth_unavailable', 'Wallet authentication is not configured.');
    return reply.code(204).send();
  });
  app.get('/v1/card', { schema: { response: success(cardResponseSchema) } }, async request => {
    const owner = await cardUser(request);
    await service.syncProvisioning(owner);
    await service.syncIssuerBalance(owner);
    return service.getCard(owner);
  });
  app.post('/v1/cards', {
    schema: { body: emptyBodySchema, headers: idempotencyHeadersSchema, response: success(cardResponseSchema) },
  }, async request => service.createCard(await cardUser(request), String(request.headers['idempotency-key'])));
  for (const action of ['freeze', 'unfreeze'] as const) {
    app.post<{ Params: { id: string } }>(`/v1/cards/:id/${action}`, {
      schema: { body: emptyBodySchema, params: cardParamsSchema, headers: idempotencyHeadersSchema, response: success(cardResponseSchema) },
    }, async request => service.changeFreeze(await cardUser(request), request.params.id, String(request.headers['idempotency-key']), action === 'freeze'));
  }
  app.post<{ Params: { id: string } }>('/v1/cards/:id/credentials', {
    schema: { body: emptyBodySchema, params: cardParamsSchema, response: success(credentialsResponseSchema) },
  }, async request => service.revealCredentials(await cardUser(request), request.params.id));
  app.get('/v1/limits', { schema: { response: success(limitsResponseSchema) } }, async request => service.limitsFor(await cardUser(request)));
  // WebSocket change signals; clients recover through GET /v1/events?after=.
  app.register(async scope => registerEventStream(scope, options.db, cardUser,
    async owner => (await service.events(owner, 0n, 0)).latest_seq, options.eventStream));
  app.get<{ Querystring: { after?: string } }>('/v1/events', {
    schema: { querystring: eventsQuerySchema, response: success(eventsResponseSchema) },
  }, async request => service.events(await cardUser(request), BigInt(request.query.after ?? '0')));
  if (options.funding && auth) {
    const funding = options.funding;
    const wallet = async (request: FastifyRequest) => {
      const identity = await auth.authenticate(request.headers.authorization);
      return { userID: await service.walletOwner(identity.id), address: identity.wallet_address };
    };
    const key = (request: FastifyRequest) => String(request.headers['idempotency-key']);
    app.post<{ Body: TopUpCreateRequest }>('/v1/top-ups', {
      schema: { body: topUpCreateRequestSchema, headers: idempotencyHeadersSchema, response: success(topUpResponseSchema) },
    }, async request => {
      const { userID, address } = await wallet(request);
      const body = request.body;
      return service.mutation(userID, key(request), `POST:/v1/top-ups:${body.chain_id}:${body.asset}:${body.amount_cents}`,
        async tx => ({ top_up: await funding.create(tx, { userID, walletAddress: address, chainID: body.chain_id, asset: body.asset, amountCents: body.amount_cents }) }));
    });
    app.get('/v1/wallet/balances', { schema: { response: success(walletBalancesResponseSchema) } },
      async request => funding.walletBalances((await wallet(request)).address));
    app.get('/v1/top-ups', { schema: { response: success(topUpListResponseSchema) } },
      async request => ({ items: await funding.list((await wallet(request)).userID) }));
    app.get<{ Params: { id: string } }>('/v1/top-ups/:id', { schema: { params: topUpParamsSchema, response: success(topUpResponseSchema) } },
      async request => ({ top_up: await funding.get((await wallet(request)).userID, request.params.id) }));
    app.post<{ Params: { id: string } }>('/v1/top-ups/:id/accept', {
      schema: { body: emptyBodySchema, params: topUpParamsSchema, response: success(topUpAcceptResponseSchema) },
    }, async request => {
      const { userID } = await wallet(request);
      return service.db.transaction(tx => funding.accept(tx, userID, request.params.id));
    });
    app.post<{ Params: { id: string }; Body: TopUpHashRequest }>('/v1/top-ups/:id/transaction', {
      schema: { body: topUpHashRequestSchema, params: topUpParamsSchema, response: success(topUpResponseSchema) },
    }, async request => {
      const { userID } = await wallet(request);
      return { top_up: await service.db.transaction(tx => funding.submitHash(tx, userID, request.params.id, request.body.transaction_hash)) };
    });
    app.post<{ Params: { id: string } }>('/v1/top-ups/:id/cancel', {
      schema: { body: emptyBodySchema, params: topUpParamsSchema, response: success(topUpResponseSchema) },
    }, async request => {
      const { userID } = await wallet(request);
      return { top_up: await service.db.transaction(tx => funding.cancel(tx, userID, request.params.id)) };
    });
    app.post<{ Params: { id: string } }>('/v1/top-ups/:id/check', {
      schema: { body: emptyBodySchema, params: topUpParamsSchema, response: success(topUpResponseSchema) },
    }, async request => ({ top_up: await funding.check((await wallet(request)).userID, request.params.id) }));
  }
  // Signed issuer notifications. The signature covers the exact raw body, so this scope keeps it as text.
  app.register(async scope => {
    scope.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 4096 }, (_request, body, done) => done(null, body));
    scope.post('/v1/issuer/demo/notifications', { schema: { response: success(cardEventResultSchema) } }, async request =>
      cardEvents.receive(String(request.body), request.headers['x-demo-issuer-timestamp'], request.headers['x-demo-issuer-signature']));
  });
  // Restricted test tool: generates DemoIssuer events only for the caller's own demo card.
  app.post<{ Body: DemoCardEventRequest }>('/v1/demo/card-events', {
    schema: { body: demoCardEventRequestSchema, response: success(cardEventResultSchema) },
  }, async request => {
    if (issuer.mode !== 'demo') throw new APIProblem(404, 'not_found', 'Not found.');
    return cardEvents.simulate(await cardUser(request), request.body);
  });
  app.get<{ Querystring: { cursor?: string; limit?: string } }>('/v1/history', {
    schema: { querystring: historyQuerySchema, response: success(historyResponseSchema) },
  }, async request => service.history(await cardUser(request), request.query.cursor, Number(request.query.limit ?? '20')));
  return app;
}
