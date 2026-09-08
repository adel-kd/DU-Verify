FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL=""
ARG VITE_APP_SURFACE="merchant"
ARG VITE_DEVELOPER_PORTAL_URL="https://developer-duverifay.vercel.app"

ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_SURFACE=$VITE_APP_SURFACE \
    VITE_DEVELOPER_PORTAL_URL=$VITE_DEVELOPER_PORTAL_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm test && npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
