FROM node:18-slim

# Instala dependências necessárias para o Chromium rodar no Linux
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Define a variável para o Puppeteer encontrar o Chromium instalado
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

# O bot roda na porta 3000 (definida no seu web.js)
EXPOSE 3000

# No Docker, geralmente não usamos PM2 (o próprio Docker gerencia o ciclo de vida)
# Mas você pode usar se preferir. Aqui usaremos o node direto:
CMD [ "node", "chatbot.js" ]