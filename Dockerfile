FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
RUN mkdir -p ./db
EXPOSE 3000
CMD ["node", "src/index.js"]
