FROM node:18-slim
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

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install -g npm@latest && \
    npm install --omit=dev
COPY . .
EXPOSE 3000
CMD [ "node", "chatbot.js" ]
