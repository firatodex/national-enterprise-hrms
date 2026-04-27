FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY frontend /frontend
RUN mkdir -p ./db
RUN node src/utils/init-db.js
EXPOSE 3000
CMD ["node", "src/index.js"]
