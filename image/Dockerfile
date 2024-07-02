FROM node:12-alpine

WORKDIR /src

COPY /src/package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["node", "./src/server.mjs"]