FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public

RUN adduser -D -u 10001 uygulama \
    && mkdir -p /data \
    && ln -s /data /app/data \
    && chown -R uygulama:uygulama /data /app

USER uygulama

ENV PORT=3090 \
    DATA_DIR=/data \
    NODE_ENV=production

EXPOSE 3090

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3090/api/health || exit 1

CMD ["node", "server.js"]
