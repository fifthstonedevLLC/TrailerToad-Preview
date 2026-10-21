# TrailerToad.com — static site served by nginx.
# Build:  docker build -t trailertoad-site .
# Run:    docker run -d --name trailertoad-site -p 8080:80 trailertoad-site

# --- Stage 1: cut the hero video down to the 10 seconds the page loops (0:15-0:25),
#     drop the audio track and put the index first so it starts playing immediately.
FROM alpine:3.20 AS media
RUN apk add --no-cache ffmpeg
COPY video/toad-salt-flats.mp4 /src.mp4
RUN ffmpeg -hide_banner -loglevel error -ss 15 -i /src.mp4 -t 10 -an \
      -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart \
      /hero.mp4

# --- Stage 2: install the quote API's production dependencies (AWS SES client)
FROM node:22-alpine AS api
WORKDIR /opt/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY api/server.mjs ./

# --- Stage 3: nginx serving the site, with the quote API running beside it on 127.0.0.1:3000
FROM nginx:1.27-alpine
RUN apk add --no-cache nodejs
COPY --from=api /opt/api /opt/api
COPY api/start.sh /docker-entrypoint.d/40-trailertoad-api.sh
RUN chmod +x /docker-entrypoint.d/40-trailertoad-api.sh
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY . /usr/share/nginx/html
COPY --from=media /hero.mp4 /usr/share/nginx/html/video/toad-salt-flats.mp4
RUN rm -rf /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/security-headers.conf /usr/share/nginx/html/api
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
