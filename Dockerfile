FROM node:18
RUN npm install pm2 -g
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Instala o servidor SSH
RUN apt-get update && apt-get install -y openssh-server
RUN mkdir /var/run/sshd

# Instala o Chromium e dependências para o Puppeteer rodar no Linux
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Define uma variável de ambiente para o Puppeteer saber onde está o Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY . .
CMD pm2-runtime ecosystem.config.js

