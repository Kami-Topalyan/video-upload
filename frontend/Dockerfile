# ---- build: compile the Vite app to static files
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: nginx serves the static bundle and proxies /api to the backend
FROM nginx:1.27-alpine AS runtime

# The official nginx image runs envsubst on /etc/nginx/templates/*.template at start-up.
ENV API_UPSTREAM=http://api:4000 \
    MAX_BODY_SIZE=6g

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
