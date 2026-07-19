# Build from repository root:
#   docker build -f resgro-landing/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://resgro-api-xxx.run.app \
#     --build-arg VITE_AGENTS_API_URL=https://resgro-agents-api-xxx.run.app \
#     -t resgro-ui .
FROM node:20-alpine AS build
WORKDIR /app

COPY resgro-landing/package.json resgro-landing/package-lock.json* ./resgro-landing/
RUN cd resgro-landing && npm ci

COPY resgro-landing ./resgro-landing
COPY agents ./agents

ARG VITE_API_BASE_URL
ARG VITE_AGENTS_API_URL
# Leave unset so resgro.ai = landing and app.resgro.ai = portal (isPortalHost).
ARG VITE_FORCE_APP_HOST=
ARG VITE_SITE_URL
ARG VITE_APP_URL
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_EMAILJS_PUBLIC_KEY
ARG VITE_EMAILJS_SERVICE_ID
ARG VITE_EMAILJS_TEMPLATE_ID
ARG VITE_ADMIN_EMAILS

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_AGENTS_API_URL=$VITE_AGENTS_API_URL
ENV VITE_FORCE_APP_HOST=$VITE_FORCE_APP_HOST
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_EMAILJS_PUBLIC_KEY=$VITE_EMAILJS_PUBLIC_KEY
ENV VITE_EMAILJS_SERVICE_ID=$VITE_EMAILJS_SERVICE_ID
ENV VITE_EMAILJS_TEMPLATE_ID=$VITE_EMAILJS_TEMPLATE_ID
ENV VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS

RUN cd resgro-landing && npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY resgro-landing/nginx.conf /etc/nginx/nginx.conf.static
COPY resgro-landing/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY resgro-landing/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/resgro-landing/dist /usr/share/nginx/html
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
