FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci 
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM build AS migrate
ENV PRISMA_HIDE_UPDATE_MESSAGE=true
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS test
ENV PRISMA_HIDE_UPDATE_MESSAGE=true
COPY vitest.config.mts ./
COPY test ./test
CMD ["npx", "vitest", "run"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main/server.js"]