# API image. Build context is a release directory produced by deploy/deploy.sh
# (git archive of apps/api, packages/api-contracts and deploy). No .env or secrets inside.
FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json apps/api/.npmrc ./
RUN npm ci --omit=dev --no-audit && npm cache clean --force
COPY packages/api-contracts /app/packages/api-contracts
COPY apps/api/src ./src
COPY apps/api/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
