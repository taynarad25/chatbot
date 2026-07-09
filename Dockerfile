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

# Garante que a pasta de trabalho pertence ao usuário node
RUN chown node:node /usr/src/app

# Roda como usuário node por segurança e boas práticas
USER node

# Copia arquivos de dependências com a permissão correta
COPY --chown=node:node package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copia os demais arquivos do projeto com a permissão correta
COPY --chown=node:node . .

EXPOSE 3000
CMD [ "node", "chatbot.js" ]