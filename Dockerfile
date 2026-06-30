FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p data public/uploads
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
