FROM node:20-slim

# Instala o Chromium e suas dependências
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    procps \
    libgbm1 \
    libasound2 \
    libnss3 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Ajuste de permissões para o usuário node
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .
RUN chown -R node:node /usr/src/app

# Roda como usuário node por segurança
USER node

EXPOSE 3000
CMD [ "node", "chatbot.js" ]