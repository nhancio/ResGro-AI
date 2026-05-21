# Build context = repository root (includes apis/netlify).
#   docker build -f apis/http/Dockerfile -t resgro-api .
#   gcloud run deploy resgro-api --source . --dockerfile apis/http/Dockerfile
# Do NOT use: gcloud run deploy --source apis/http  (netlify handlers are outside that folder).
FROM node:20-alpine
WORKDIR /app

COPY apis/netlify/package.json apis/netlify/package-lock.json* ./netlify/
RUN cd netlify && npm ci --omit=dev

COPY apis/netlify/functions ./netlify/functions

COPY apis/http/package.json apis/http/package-lock.json* ./http/
RUN cd http && npm ci --omit=dev

COPY apis/http/server.js ./http/server.js

WORKDIR /app/http
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
