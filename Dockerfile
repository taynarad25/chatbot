FROM node:20-slim

# Instala dependências do Chromium
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
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

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