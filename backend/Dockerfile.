
FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node

EXPOSE 3000

CMD ["node", "src/app.js"]
