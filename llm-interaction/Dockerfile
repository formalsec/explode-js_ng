FROM node:18

WORKDIR /home/gc/Desktop/MEIC/ano-2/tese/explode-js_ng/llm-interaction

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

CMD ["npm", "start"]
