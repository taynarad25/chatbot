# Bot de Secretaria — Comunidade Cristã Curados

Bot de WhatsApp para a secretaria da igreja, com integração à Google Agenda e um painel web de controle. Construído com [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) (Puppeteer/Chromium) e a API do Google Calendar.

## Funcionalidades

### Menu principal

Qualquer saudação ("oi", "olá", "paz", "bom dia", "boa tarde", "boa noite", "menu"...) reseta a conversa e mostra o menu. O menu tem duas versões: uma para o público geral e outra, com opções extras, para números cadastrados como líder (aba "Líderes" do painel web, veja abaixo).

| Opção | Disponível para | O que faz |
|---|---|---|
| 1️⃣ Horário dos cultos | Todos | Mensagem estática com horários, endereços e avisos de mudança de salão |
| 2️⃣ Ver agenda da igreja | Todos | Consulta a Google Agenda (ver abaixo) |
| 3️⃣ Atendimento pastoral | Todos | Coleta nome e disponibilidade, encaminha para a secretaria |
| 4️⃣ Aulas de música | Todos | Mensagem estática sobre as aulas oferecidas |
| 5️⃣ Falar com a secretaria | Todos | Avisa o grupo interno que alguém quer atendimento |
| 6️⃣ Agendar ou alterar evento | Só líderes | Agendamento de evento novo ou alteração de um existente |
| 7️⃣ Comunicados e avisos nos cultos | Só líderes | Envia um comunicado em texto livre para a secretaria incluir nos avisos |

### 📅 Ver agenda (Opção 2)

1. O bot lista os meses restantes do ano atual, mais a opção `0 - Escolher um período específico`.
2. **Por mês:** mostra todos os eventos daquele mês, agrupados — um evento que se repete 3+ vezes no mesmo horário e dia da semana vira uma linha só ("Todas as Quintas às 19h30"); o resto aparece com a data específica.
3. **Por período personalizado:** aceita texto livre no formato `DD/MM a DD/MM` (também aceita "até" ou "-" como separador). Validado: formato, datas reais, data inicial não pode estar no passado, data final não pode ser antes da inicial, máximo de 90 dias, e trata corretamente período que cruza o ano novo (ex: `28/12 a 05/01`).
4. **Detalhe do evento:** a lista vem numerada — digitando o número de um item, o bot responde com data, horário, endereço e descrição do evento (quando cadastrados na Google Agenda). Eventos recorrentes mostram a próxima ocorrência a partir de hoje.
5. Eventos marcados como "Sábado LIVRE" na agenda de Evangelismo são escondidos da consulta geral (servem só para o controle interno de disponibilidade, ver abaixo).

### 🙏 Atendimento pastoral (Opção 3)

Pergunta nome e dias/horários disponíveis, depois envia um resumo para o grupo interno da secretaria entrar em contato.

### 📆 Agendar ou alterar evento (Opção 6, só líderes)

#### Agendar novo evento

1. Nome do evento → rede responsável (uma de 10: Evangelismo, Epifania, Intercessão, Projeto Social Seeds, Rede Ruach, Rede de Casais, Rede de Homens, Rede de Mulheres, Rede Kids, Outros) → mês → dia da semana (ou "vários dias/evento longo") → horário (ou `DIA TODO`).
2. O bot verifica a disponibilidade no mês inteiro, aplicando todas as regras:
   - **Sábado LIVRE:** um sábado marcado assim na agenda de Evangelismo bloqueia qualquer outro agendamento naquele dia.
   - **Evento de dia inteiro:** bloqueia (e é bloqueado por) qualquer outro evento no mesmo dia.
   - **Conflito de horário:** eventos com hora marcada têm uma margem de segurança de **1 hora** antes e depois — um evento que termina às 20h bloqueia novos agendamentos até as 21h no mesmo local de calendário.
   - **Exceção da Rede Ruach:** entre os sábados livres do mês, o último fica automaticamente reservado só para a Rede Ruach.
3. O líder escolhe uma das datas livres. O bot notifica o grupo **"Mensagens Secretaria"** com um resumo e pede que respondam **"marcar evento"** (grava automaticamente na agenda do Google certa, e avisa o solicitante) ou **"não marcar"** (só avisa o solicitante da recusa).

#### Alterar evento existente

1. Escolhe o departamento/rede → o bot lista até 15 próximos eventos daquela agenda no ano corrente → escolhe o evento → descreve em texto livre o que precisa mudar.
2. O bot notifica o grupo **"Mensagens Secretaria"**, que responde **"agendar"** (aprova) ou **"não agendar"** (recusa) — o solicitante é notificado da decisão. Como a mudança é uma descrição em texto livre, a edição em si na Google Agenda é feita manualmente pela secretaria.

### 📢 Comunicados e avisos (Opção 7, só líderes)

Texto livre que é encaminhado para o grupo da secretaria incluir nos avisos do culto.

### Grupo "Mensagens Secretaria"

Esse grupo do WhatsApp é o canal central de aprovação: toda solicitação (agendamento, alteração, atendimento pastoral, comunicado, "falar com a secretaria") gera uma notificação nele. As respostas **"marcar evento"/"não marcar"** e **"agendar"/"não agendar"** só funcionam quando enviadas *como resposta* (reply) à mensagem original do bot — os dados da solicitação viajam embutidos na própria mensagem (não dependem do texto visível, então mudar a formatação da mensagem não quebra o processamento).

### Painel de controle web

Interface HTTP simples (`web.js` + `web/`) para gerenciar o bot sem acesso ao servidor:

- **Login** com sessão em cookie (`HttpOnly`, `SameSite=Strict`) e rate limiting de tentativas por IP.
- **Status da conexão:** mostra se o WhatsApp está conectado, gera QR Code para parear, permite cancelar ou desconectar.
- **Gestão de usuários** (admin): criar usuário (com senha definida na hora, ou como "pendente" para a pessoa definir a própria senha depois via `/register`), listar e excluir.
- **Gestão de líderes** (admin): cadastrar, listar, editar e remover líderes (nome + telefone). Persistido em `lideres.json`, aplicado ao bot imediatamente, sem precisar reiniciar.
- **Logs** (admin): visualizar e limpar o arquivo de log combinado do bot.

## Como funciona por baixo dos panos

- **WhatsApp:** [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) controlando uma instância headless do Chromium via Puppeteer. A sessão fica persistida em `.wwebjs_auth`, então reconectar depois de um restart normal não pede um novo QR Code — só volta a pedir se alguém desconectar explicitamente pelo painel.
- **Google Agenda:** 10 agendas do Google Calendar (uma por rede/departamento), lidas e escritas via `googleapis`, usando uma conta de serviço (`credenciais-google.json`).
- **Estado da conversa:** guardado em memória por número de telefone — não sobrevive a um restart do processo (a pessoa precisa mandar "menu" de novo).

## Estrutura do projeto

```
bot/                            domínio do bot de WhatsApp
  chatbot.js                    ponto de entrada: cliente WhatsApp, integração com o Google Calendar e o painel web
  messageHandler.js             menu e fluxos de conversa (todo o roteamento de mensagens do bot)
  agenda.js                     consulta/formatação da agenda (Opção 2)
  disponibilidade.js            cálculo de disponibilidade para agendamento (Opção 6)
  redes.js                      mapeamento único "rede -> agenda do Google"
  secretaria.js                 notificação do grupo "Mensagens Secretaria"
  agendamentoAutomatico.js      codificação/decodificação dos dados de agendamento embutidos nas mensagens do grupo
web.js                          servidor HTTP do painel de controle
web/                            autenticação, usuários, rate limiter, IP do cliente, views HTML
test/                           suíte de testes (node --test)
```

`bot/chatbot.js` é o único arquivo do projeto que ainda depende de onde fica em relação à raiz: `credenciais-google.json`, `login.json`, `lideres.json`, `combined.log`, `bot_state.json` e a sessão do WhatsApp (`.wwebjs_auth/`) sempre viveram na raiz do projeto (é lá que o `docker-compose.bot.yml` monta os volumes), então ele resolve esses caminhos explicitamente a partir de `bot/../` em vez de assumir que o processo foi iniciado da raiz.

## Configuração

Variáveis de ambiente (arquivo `.env`, veja `docker-compose.bot.yml`):

| Variável | Uso |
|---|---|
| `WHATSAPP_LIDERES` | Números de telefone (separados por vírgula) usados apenas para semear `lideres.json` na primeira execução (se o arquivo ainda não existir). Depois disso, o cadastro de líderes é feito pela aba "Líderes" do painel web |
| `PUPPETEER_EXECUTABLE_PATH` | Caminho de um Chromium já instalado (opcional, usado no Docker) |
| `LOGIN_FILE_PATH` | Sobrescreve o caminho de `login.json` (usado pelos testes, para nunca tocar no arquivo real) |
| `LIDERES_FILE_PATH` | Sobrescreve o caminho de `lideres.json` (idem) |
| `COMBINED_LOG_PATH` | Sobrescreve o caminho do log combinado (idem) |

Arquivos necessários (não versionados, veja `.gitignore`):

- `credenciais-google.json` — chave de conta de serviço do Google com acesso às 10 agendas.
- `login.json` — usuários do painel web (veja `login.json.example`).
- `lideres.json` — líderes com acesso às opções extras do bot (nome + telefone); veja `lideres.json.example`.

⚠️ **`login.json` e `lideres.json` precisam existir na raiz do projeto *antes* do primeiro `docker compose up`** (copie os `.example` correspondentes, ex: `cp lideres.json.example lideres.json`). O `docker-compose.bot.yml` monta os dois como bind mount de arquivo — se o arquivo não existir no host nesse momento, o Docker cria um **diretório** vazio no lugar dele dentro do container, e o painel nunca mais consegue ler/gravar nada ali (as edições parecem "sumir" a cada redeploy, porque o container é recriado do zero e o "arquivo" nunca foi de fato o volume persistido). Se você já rodou o bot antes desse mount existir, confira se `lideres.json` na raiz é mesmo um arquivo (`ls -la lideres.json`) antes de subir de novo.

⚠️ **Permissão de escrita**: o container roda como usuário `node` (não-root, veja `Dockerfile`), então `login.json` e `lideres.json` no host precisam ser graváveis por ele. Se você criou o arquivo como root (`sudo`, ou logado como root no servidor), o container pode não conseguir gravar nele. Se aparecer erro de permissão ao editar líderes/usuários pelo painel:
```bash
ls -la lideres.json login.json   # confere o dono/permissão atual
chmod 664 lideres.json login.json   # ou 666, se o dono não puder ser trocado para o usuário do container
docker compose -f docker-compose.bot.yml restart
```

## Rodando

```bash
npm install
node bot/chatbot.js
```

Ou via Docker (inclui a instalação do Chromium):

```bash
docker compose -f docker-compose.bot.yml up -d --build
```

O deploy em produção acontece via GitHub Actions (`.github/workflows/deploy.yml`), que conecta ao servidor por um túnel Cloudflare e reconstrói o container a cada push em `main`.

## Testes

```bash
npm test
```

Roda a suíte com o test runner nativo do Node (`node --test`) sobre a lógica pura extraída para módulos isolados (agenda, disponibilidade, redes, autenticação, rate limiting) e testes de integração HTTP reais para o painel web, numa porta efêmera e com os arquivos de dados isolados em diretório temporário.
