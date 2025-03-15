FROM node:22-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY . .  

CMD ["npm", "run", "start"]
