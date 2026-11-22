FROM node:22-bookworm
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx playwright install --with-deps chromium
RUN mkdir -p /app/uploads /app/data /app/browser_profiles /app/execution_proofs

EXPOSE 3000
CMD ["npm", "start"]
