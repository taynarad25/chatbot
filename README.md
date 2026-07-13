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
| 6️⃣ Agendar, alterar ou cancelar evento | Só líderes | Agendamento de evento novo, alteração ou cancelamento de um existente |
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

1. Nome do evento → local → departamento responsável (um de 10: Evangelismo, Epifania, Intercessão, Projeto Social Seeds, Rede Ruach, Rede de Casais, Rede de Homens, Rede de Mulheres, Rede Kids, Outros) → mês.
2. O bot pergunta **como o líder prefere escolher a data**, pra atender dois jeitos de pensar diferentes:
   - **"1 - Já tenho uma data específica"**: digita o dia do mês diretamente. O bot verifica se aquele dia está disponível e, se estiver, **sugere os horários livres** (considerando 1h de intervalo antes/depois de outros eventos, dentro de uma janela comercial de 07h-22h) antes de perguntar o horário desejado.
   - **"2 - Baseado no dia da semana e horário"**: fluxo tradicional — escolhe o dia da semana (ou "vários dias/evento longo") e o horário (ou `DIA TODO`), e o bot lista todas as datas livres do mês que batem com esses critérios.
3. Nos dois caminhos, o bot aplica as mesmas regras de disponibilidade:
   - **Sábado LIVRE:** um sábado marcado assim na agenda de Evangelismo bloqueia qualquer outro agendamento naquele dia.
   - **Evento de dia inteiro:** bloqueia (e é bloqueado por) qualquer outro evento no mesmo dia.
   - **Conflito de horário:** eventos com hora marcada têm uma margem de segurança de **1 hora** antes e depois — um evento que termina às 20h bloqueia novos agendamentos até as 21h no mesmo local de calendário.
   - **Exceção da Rede Ruach:** entre os sábados livres do mês, o último fica automaticamente reservado só para a Rede Ruach.
   - **Data no passado:** um dia anterior a hoje nunca aparece como disponível (caminho "2") nem é aceito como data específica (caminho "1") — mesma regra já aplicada à busca de agenda por período personalizado (opção 2).
4. O bot notifica o grupo **"Mensagens Secretaria"** com um resumo e pede que respondam, **como resposta (reply) a essa mensagem**, **"marcar evento"** (grava automaticamente na agenda do Google certa, e avisa o solicitante) ou **"não marcar"** (só avisa o solicitante da recusa).

#### Alterar evento existente

1. Escolhe o departamento → o bot lista até 15 próximos eventos daquela agenda **a partir de hoje** até o fim do ano corrente → escolhe o evento → escolhe **o que mudar**: Horário, Data, Nome do evento, Local, ou "Outra alteração" (texto livre, para o que não encaixar nas opções estruturadas).
2. O bot notifica o grupo **"Mensagens Secretaria"**, que responde, **como resposta (reply) a essa mensagem**, **"alterar evento"** (aprova) ou **"não alterar"** (recusa) — o solicitante é notificado da decisão.
   - Para as 4 opções estruturadas (horário/data/nome/local), a aprovação **já aplica a mudança automaticamente** na Google Agenda (via `calendar.events.patch`), sem precisar editar manualmente.
   - Para "Outra alteração" (texto livre), como o bot não interpreta o texto com segurança, a edição continua sendo feita manualmente pela secretaria depois de aprovar.
   - **Evento que já passou:** nunca aparece na lista pra escolher — não dá pra alterar nem cancelar um evento que já aconteceu, isso precisa virar um agendamento novo (opção 1).
   - **Nova data no passado:** ao escolher "Data" como o que mudar, uma data anterior a hoje é recusada como **data inválida** ("❌ Data inválida: esse dia já passou. Escolha uma data a partir de hoje."), mesma lógica de "Agendar novo evento".

#### Cancelar evento existente

1. Escolhe o departamento → escolhe o evento na lista → confirma digitando **SIM**.
2. O bot notifica o grupo **"Mensagens Secretaria"**, que responde, **como resposta (reply) a essa mensagem**, **"cancelar evento"** (remove o evento da Google Agenda automaticamente, via `calendar.events.delete`, e avisa o solicitante) ou **"manter evento"** (nega o cancelamento, o evento continua marcado).

### 📢 Comunicados e avisos (Opção 7, só líderes)

Texto livre que é encaminhado para o grupo da secretaria incluir nos avisos do culto.

### Grupo "Mensagens Secretaria"

Esse grupo do WhatsApp é o canal central de aprovação: toda solicitação (agendamento, alteração, atendimento pastoral, comunicado, "falar com a secretaria") gera uma notificação nele.

⚠️ **As respostas "marcar evento"/"não marcar", "alterar evento"/"não alterar" e "cancelar evento"/"manter evento" só funcionam quando enviadas como resposta (reply/citação) à mensagem original do bot** — segure/deslize na mensagem do bot no grupo e escolha "Responder" antes de digitar. Digitar como uma mensagem solta, sem responder, é ignorado silenciosamente (o bot não avisa que não entendeu).

Nas solicitações que só líderes podem fazer — **agendar, alterar ou cancelar evento** e **comunicado para o culto** —, o campo "Solicitante" mostra o nome cadastrado do líder na aba "Líderes" do painel (não o nome/apelido salvo no celular dele) — evita depender de como cada líder configurou o próprio perfil do WhatsApp. Sem um líder cadastrado com esse telefone (ou com o nome em branco), cai de volta no nome do contato salvo no celular do próprio bot. Já o pedido de atendimento (opção 5, aberto a qualquer pessoa) continua usando o nome do contato, já que quem manda pode não ser um líder cadastrado.

Cada mensagem de pedido termina com um código curto (ex: `_Código: A3F9_`), que é como o bot sabe qual solicitação está sendo respondida — os dados completos ficam guardados em `pendentes.json` (veja abaixo), não na mensagem em si, então o texto visível pode mudar livremente sem afetar o processamento. Isso também é o que permite ter **várias solicitações pendentes ao mesmo tempo**: cada uma tem seu próprio código, e a secretaria responde à mensagem específica que quer decidir. Depois de aprovada ou recusada, a solicitação é removida de `pendentes.json` — responder de novo à mesma mensagem (exceto logo após um erro ao gravar no Google Calendar, quando a solicitação é mantida de propósito pra permitir tentar de novo) avisa que não encontrou mais nada pendente ali.

### Painel de controle web

Interface HTTP simples (`web.js` + `web/`) para gerenciar o bot sem acesso ao servidor:

- **Login** com sessão em cookie (`HttpOnly`, `SameSite=Strict`) e rate limiting de tentativas por IP.
- **Status da conexão:** mostra se o WhatsApp está conectado, gera QR Code para parear, permite cancelar ou desconectar.
- **Gestão de usuários** (admin): criar usuário (com senha definida na hora, ou como "pendente" para a pessoa definir a própria senha depois via `/register`), listar e excluir.
- **Gestão de líderes** (admin): cadastrar, listar, editar e remover líderes (nome + telefone), com filtros de busca por nome (ignora acentos/maiúsculas) e por telefone (aceita um trecho parcial do número). Persistido em `lideres.json`, aplicado ao bot imediatamente, sem precisar reiniciar.
- **Logs** (admin): visualizar e limpar o arquivo de log combinado do bot.

## Como funciona por baixo dos panos

- **WhatsApp:** [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) controlando uma instância headless do Chromium via Puppeteer. A sessão fica persistida em `.wwebjs_auth`, então reconectar depois de um restart normal não pede um novo QR Code — só volta a pedir se alguém desconectar explicitamente pelo painel.
- **Google Agenda:** 10 agendas do Google Calendar (uma por departamento), lidas e escritas via `googleapis`, usando uma conta de serviço (`credenciais-google.json`).
- **Estado da conversa:** guardado em memória por número de telefone — não sobrevive a um restart do processo (a pessoa precisa mandar "menu" de novo).
- **Logs:** todo log que menciona um número de telefone mostra o nome do contato + o telefone mascarado (ex: `Taynara Diniz | +55 (11) *****-6727 (Usuário)`), nunca o número completo — visível na aba "Logs" do painel.

## Estrutura do projeto

```
bot/                            domínio do bot de WhatsApp
  chatbot.js                    ponto de entrada: cliente WhatsApp, integração com o Google Calendar e o painel web
  messageHandler.js             menu e fluxos de conversa (todo o roteamento de mensagens do bot)
  agenda.js                     consulta/formatação da agenda (Opção 2)
  disponibilidade.js            cálculo de disponibilidade para agendamento (Opção 6)
  redes.js                      mapeamento único "rede -> agenda do Google"
  secretaria.js                 notificação do grupo "Mensagens Secretaria"
  agendamentoAutomatico.js      monta o "resource" (criação/patch) enviado à API do Google Calendar
  pendentesAprovacao.js         solicitações aguardando aprovação da secretaria (pendentes.json), identificadas por um código curto na mensagem do grupo
web.js                          servidor HTTP do painel de controle
web/                            autenticação, usuários, rate limiter, IP do cliente, views HTML
test/                           suíte de testes (node --test)
```

`bot/chatbot.js` é o único arquivo do projeto que ainda depende de onde fica em relação à raiz: `credenciais-google.json`, `login.json`, `lideres.json`, `pendentes.json`, `combined.log`, `bot_state.json` e a sessão do WhatsApp (`.wwebjs_auth/`) sempre viveram na raiz do projeto (é lá que o `docker-compose.bot.yml` monta os volumes), então ele resolve esses caminhos explicitamente a partir de `bot/../` em vez de assumir que o processo foi iniciado da raiz.

## Configuração

Variáveis de ambiente (arquivo `.env`, veja `docker-compose.bot.yml`):

| Variável | Uso |
|---|---|
| `WHATSAPP_LIDERES` | Números de telefone (separados por vírgula) usados apenas para semear `lideres.json` na primeira execução (se o arquivo ainda não existir). Depois disso, o cadastro de líderes é feito pela aba "Líderes" do painel web |
| `PUPPETEER_EXECUTABLE_PATH` | Caminho de um Chromium já instalado (opcional, usado no Docker) |
| `LOGIN_FILE_PATH` | Sobrescreve o caminho de `login.json` (usado pelos testes, para nunca tocar no arquivo real) |
| `LIDERES_FILE_PATH` | Sobrescreve o caminho de `lideres.json` (idem) |
| `PENDENTES_FILE_PATH` | Sobrescreve o caminho de `pendentes.json` (idem) |
| `COMBINED_LOG_PATH` | Sobrescreve o caminho do log combinado (idem) |

Arquivos necessários (não versionados, veja `.gitignore`):

- `credenciais-google.json` — chave de conta de serviço do Google com acesso às 10 agendas.
- `login.json` — usuários do painel web (veja `login.json.example`).
- `lideres.json` — líderes com acesso às opções extras do bot (nome + telefone); veja `lideres.json.example`.
- `pendentes.json` — solicitações aguardando aprovação da secretaria (veja "Grupo Mensagens Secretaria" acima); veja `pendentes.json.example`.

⚠️ **`login.json`, `lideres.json` e `pendentes.json` precisam existir na raiz do projeto *antes* do primeiro `docker compose up`** (copie os `.example` correspondentes, ex: `cp pendentes.json.example pendentes.json`). O `docker-compose.bot.yml` monta os três como bind mount de arquivo — se o arquivo não existir no host nesse momento, o Docker cria um **diretório** vazio no lugar dele dentro do container, e o bot nunca mais consegue ler/gravar nada ali (as edições/solicitações parecem "sumir" a cada redeploy, porque o container é recriado do zero e o "arquivo" nunca foi de fato o volume persistido). Se você já rodou o bot antes desse mount existir, confira se cada um é mesmo um arquivo (`ls -la pendentes.json`) antes de subir de novo.
- Se isso acontecer com `pendentes.json` especificamente (o mais recente dos três), o líder que estava agendando/alterando/cancelando um evento recebe **"⚠️ Não consegui registrar sua solicitação agora. Tente novamente em instantes."** no WhatsApp — mensagem que só aparece exatamente quando `salvarPendente()` falha (arquivo quebrado, sem permissão de escrita, etc.), diferente de **"⚠️ Erro ao acessar a agenda."**, que é sobre uma falha ao ler o Google Calendar. Corrija o arquivo (ver acima) e peça pro líder tentar de novo — essa tentativa não ficou salva em nenhum lugar.

⚠️ **Permissão de escrita**: o container roda como usuário `node` (não-root, veja `Dockerfile`), então `login.json`, `lideres.json` e `pendentes.json` no host precisam ser graváveis por ele. Se você criou o arquivo como root (`sudo`, ou logado como root no servidor), o container pode não conseguir gravar nele. Se aparecer erro de permissão ao editar líderes/usuários pelo painel, ou ao aprovar/recusar uma solicitação no grupo:
```bash
ls -la lideres.json login.json pendentes.json   # confere o dono/permissão atual
chmod 664 lideres.json login.json pendentes.json   # ou 666, se o dono não puder ser trocado para o usuário do container
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
