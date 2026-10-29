FROM ghcr.io/puppeteer/puppeteer:22.6.0

USER root
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
