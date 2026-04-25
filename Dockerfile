FROM node:18-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/src ./src
COPY backend/db ./db
EXPOSE 3002
CMD ["npm", "start"]
