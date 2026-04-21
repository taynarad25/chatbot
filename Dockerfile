FROM node:18-slim

# Instala dependências do sistema e ferramentas de processo
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
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Define a variável para o Puppeteer encontrar o Chromium instalado
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /usr/src/app

# Atualiza o npm para a versão mais recente e instala dependências
COPY package*.json ./
RUN npm install -g npm@latest && \
    npm install --omit=dev

COPY . .

# O bot roda na porta 3000 (definida no seu web.js)
EXPOSE 3000

# No Docker, geralmente não usamos PM2 (o próprio Docker gerencia o ciclo de vida)
# Mas você pode usar se preferir. Aqui usaremos o node direto:
CMD [ "node", "chatbot.js" ]