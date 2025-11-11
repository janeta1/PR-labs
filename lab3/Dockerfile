FROM node:22-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run compile
EXPOSE 8080
CMD ["npm", "start", "8080", "./PR-labs/lab3/boards/zoom.txt"]
