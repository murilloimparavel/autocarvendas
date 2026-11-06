# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

# Keystone and Next evaluate configuration while compiling. These are only
# build placeholders; production values must be supplied by Coolify at runtime.
ENV NODE_ENV=production \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    SESSION_SECRET=autocarvendas-build-only-session-secret-never-use-in-production \
    S3_BUCKET_NAME=autocarvendas-media \
    S3_REGION=us-east-1 \
    S3_ACCESS_KEY_ID=build-only \
    S3_SECRET_ACCESS_KEY=build-only \
    S3_ENDPOINT=https://s3.caldasindica.com
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "npm run migrate && npm start"]
