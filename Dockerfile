FROM node:22-slim

# Instala o Chromium e suas dependências
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Garante que a pasta de trabalho pertence ao usuário node
RUN chown node:node /usr/src/app

# Roda como usuário node por segurança e boas práticas
USER node

# Copia arquivos de dependências com a permissão correta
COPY --chown=node:node package*.json ./
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force

# Copia só o que o bot precisa em runtime, explicitamente — em vez de "COPY . .",
# que copiaria o contexto de build inteiro (incluindo test/, .git/ se não fosse
# ignorado, etc.) pra dentro da imagem.
COPY --chown=node:node bot/ ./bot/
COPY --chown=node:node web/ ./web/
COPY --chown=node:node web.js ./
COPY --chown=node:node db.js ./

EXPOSE 3000
CMD [ "node", "bot/chatbot.js" ]