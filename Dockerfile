FROM node:22-slim
WORKDIR /srv
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY public/ public/
COPY server/src/ server/src/
COPY server/smoke.js server/
RUN mkdir -p /data && chown -R node:node /srv /data
USER node
ENV PORT=3000 DB_PATH=/data/app.db
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
