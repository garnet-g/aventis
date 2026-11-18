# VibeCrew web app: a small production image for any host (a Kenyan VPS or data centre, or any cloud).
# Build:  docker build -t vibecrew --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#           --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain .
# Run:    docker run -p 3000:3000 --env-file .env.production vibecrew
# NEXT_PUBLIC_* values are baked into the browser code at build time; every other setting is read when it runs.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CONTACT_PHONE
ARG NEXT_PUBLIC_CONTACT_WHATSAPP
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Africa/Nairobi
RUN groupadd --system app && useradd --system --gid app app
# the standalone server, the static files, and the fonts the print files are drawn with
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/assets/fonts ./assets/fonts
USER app
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
