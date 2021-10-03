FROM node:14-alpine as build
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN apk add --no-cache git
RUN npm ci

COPY . ./
RUN npm test
RUN npm run build:js

FROM node:14-alpine as runtime
ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80
WORKDIR /app
COPY --from=build /app ./
ENTRYPOINT ["node", "lib/waka-orchestrator/standalone.js"]
