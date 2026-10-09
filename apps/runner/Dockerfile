FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@10.11.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/runner/package.json apps/runner/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
RUN pnpm install --frozen-lockfile --filter @vibeguard/runner...
COPY apps/runner apps/runner
COPY packages/contracts packages/contracts
RUN pnpm --filter @vibeguard/runner build
RUN mkdir -p /data/vibeguard && chown node:node /data/vibeguard
USER node
ENV VIBEGUARD_HOST=0.0.0.0
ENV VIBEGUARD_WORKSPACE=/data/vibeguard
EXPOSE 4310
CMD ["node", "apps/runner/dist/index.js"]
