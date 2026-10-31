FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web

ENV NODE_ENV=production
ENV PORT=47821
ENV WEB_TRUST_PROXY=true
EXPOSE 47821

CMD ["npx", "tsx", "src/web/server.ts"]
