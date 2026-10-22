# Build the game, then serve it with `vite preview`, which also runs the co-op relay
# (server/relay.ts, at /mp): one process for the game and its websockets.
# The models in public/models are committed, so the build doesn't need Blender.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && rm -rf public tools docs
# lets the deploy workflow check which commit is live
ARG GIT_SHA=dev
RUN echo "$GIT_SHA" > dist/version.txt
EXPOSE 80
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "80", "--strictPort"]
