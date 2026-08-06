# Migração: do notebook para a Oracle Cloud

Guia passo a passo para tirar o bot do notebook caseiro e colocar rodando na Oracle Cloud (camada **Always Free**, gratuita para sempre), com o painel acessível em `https://comunidadecristacurados.com.br/secretaria`.

Pré-requisito de código: as rotas do painel já precisam estar debaixo de `/secretaria` (veja o PR "Move o painel web para debaixo de /secretaria"). Sem isso, `/secretaria/login` não existe ainda.

> Como o bot já usa **Cloudflare Tunnel** (`docker-compose.tunnel.yml`), a Oracle **não precisa liberar nenhuma porta de entrada** (nem 80, nem 443, nem 3000) — o túnel só faz conexão de saída. Isso simplifica bastante a parte de rede.

---

## Visão geral das etapas

1. Criar a conta e a máquina (instância) na Oracle Cloud.
2. Preparar o servidor: instalar Docker, clonar o projeto.
3. Copiar os arquivos de dados do notebook atual para a máquina nova.
4. Configurar o domínio `comunidadecristacurados.com.br` na Cloudflare e apontar o túnel para a máquina nova.
5. Subir o bot na Oracle e testar tudo.
6. Só depois de confirmar que está tudo funcionando, desligar o bot do notebook.

---

## 1. Criar a conta e a máquina na Oracle Cloud

### 1.1. Criar a conta

1. Acesse [cloud.oracle.com](https://cloud.oracle.com) e clique em **"Start for free"**.
2. Preencha os dados (nome, e-mail, país). A Oracle pede um cartão de crédito para verificação de identidade, mas a camada **Always Free** não cobra nada — é diferente do "free trial" de 30 dias/US$300 que outras nuvens oferecem; os recursos Always Free continuam gratuitos depois disso, indefinidamente.
3. Escolha a **Home Region** (região principal da conta) com cuidado — depois de criada, **não dá pra trocar**. Para o Brasil, `São Paulo (GRU)` ou `Vinhedo (VCP)` são as opções com menor latência, se estiverem disponíveis para novas contas Always Free na sua região; senão, `US East (Ashburn)` costuma ter mais disponibilidade de recursos gratuitos.
4. Confirme o e-mail e finalize o cadastro. Pode levar alguns minutos até a conta ficar ativa.

### 1.2. Criar a instância (a "máquina")

1. No menu (☰) do console, vá em **Compute → Instances → Create Instance**.
2. **Name**: algo como `whatsapp-bot`.
3. **Image and shape**:
   - **Image**: Ubuntu (a versão LTS mais recente disponível, ex: 24.04 ou 22.04).
   - **Shape**: clique em "Change shape", escolha **Ampere (ARM)** e selecione **VM.Standard.A1.Flex**, marcado como **"Always Free eligible"**. Configure **4 OCPUs e 24 GB de memória** (o máximo gratuito) — dá bastante folga para o Chromium do bot rodar sem travar.
     - Se essa opção não estiver disponível na sua região (às vezes a capacidade Ampere gratuita fica esgotada), use como alternativa **VM.Standard.E2.1.Micro** (AMD, também Always Free, porém só 1 OCPU / 1 GB — mais justo, mas funciona).
4. **Networking**: deixe as opções padrão (cria uma VPC/subnet nova automaticamente). Não precisa mexer em nada aqui — não vamos abrir portas.
5. **Add SSH keys**: escolha **"Generate a key pair for me"** e **baixe a chave privada** (arquivo `.pem` ou `.key`) — é a sua senha de acesso ao servidor, guarde num lugar seguro. Sem ela, não tem como entrar na máquina depois.
6. Clique em **Create**. Em 1-2 minutos a instância fica com status **Running** e mostra um **IP público**.

Anote esse **IP público** — vai precisar dele para acessar via SSH e para configurar o DNS.

---

## 2. Preparar o servidor

### 2.1. Acessar via SSH

No seu computador (a instância já vem com um usuário padrão chamado `ubuntu`):

```bash
chmod 600 caminho/para/sua-chave.pem
ssh -i caminho/para/sua-chave.pem ubuntu@SEU_IP_PUBLICO
```

No Windows, use o PowerShell (já vem com `ssh` embutido no Windows 10/11) ou o Git Bash.

### 2.2. Instalar Docker e Docker Compose

Já conectado no servidor (via SSH):

```bash
# Atualiza o sistema
sudo apt update && sudo apt upgrade -y

# Instala o Docker (script oficial)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Permite rodar docker sem sudo (precisa reconectar o SSH depois deste passo)
sudo usermod -aG docker $USER

# Docker Compose (plugin "docker compose", não o antigo "docker-compose")
sudo apt install -y docker-compose-plugin

# Sai e reconecta pra aplicar a permissão do grupo docker
exit
```

Reconecte (`ssh -i sua-chave.pem ubuntu@SEU_IP_PUBLICO`) e confirme:

```bash
docker --version
docker compose version
```

### 2.3. Clonar o projeto

```bash
git clone https://github.com/taynarad25/chatbot.git
cd chatbot
```

Se o repositório for privado, o `git clone` vai pedir autenticação — use um [Personal Access Token](https://github.com/settings/tokens) do GitHub como senha (não a senha da conta).

---

## 3. Migrar os dados do notebook atual

O bot guarda tudo que importa em arquivos na raiz do projeto (fora do controle de versão, de propósito). É só copiar esses arquivos do notebook para o servidor novo:

| Arquivo/pasta | O que é |
|---|---|
| `credenciais-google.json` | Chave da conta de serviço do Google Calendar |
| `dados.db` | Banco SQLite com usuários do painel, líderes, solicitações pendentes e o cache do JID dos grupos "Mensagens Secretaria"/"Atendimento Pastoral" |
| `.wwebjs_auth/` (pasta) | **Sessão do WhatsApp já pareada** — copiando essa pasta, você evita ter que escanear o QR Code de novo |
| `.env` | Suas variáveis de ambiente (inclusive o `CLOUDFLARE_TOKEN`, veja passo 4) |

No **notebook** (não no servidor), rode um comando `scp` para cada item, apontando pro servidor novo:

```bash
cd caminho/para/o/projeto/no/notebook

scp -i caminho/para/sua-chave.pem credenciais-google.json dados.db .env ubuntu@SEU_IP_PUBLICO:~/chatbot/

scp -i caminho/para/sua-chave.pem -r .wwebjs_auth ubuntu@SEU_IP_PUBLICO:~/chatbot/
```

Se o notebook ainda estiver numa versão anterior (com `login.json`, `lideres.json`, `pendentes.json`, `grupo_ids.json` e `bot_state.json` soltos, em vez de `dados.db`), copie esses arquivos junto e rode `node migrar_para_sqlite.js` **no servidor novo**, depois de atualizar o código — o script importa tudo pro `dados.db` automaticamente.

⚠️ Depois de copiar, confirme que `dados.db` existe como **arquivo de verdade** no servidor (`ls -la ~/chatbot/dados.db`) antes de subir o Docker — se `docker compose up` rodar com ele faltando, o Docker cria um **diretório vazio** no lugar (bug conhecido de bind mount, já documentado no README) e o bot não consegue nem abrir o banco.

---

## 4. Cloudflare: apontar o domínio novo para o servidor

### 4.1. Colocar o domínio na Cloudflare (se ainda não estiver)

1. No painel da Cloudflare, **Add a site** → digite `comunidadecristacurados.com.br`.
2. A Cloudflare vai mostrar 2 **nameservers** (algo como `xxx.ns.cloudflare.com`).
3. No lugar onde o domínio `.com.br` foi registrado (Registro.br, na maioria dos casos), troque os nameservers do domínio para os que a Cloudflare indicou. Isso pode levar algumas horas para propagar.

### 4.2. Criar (ou reapontar) o túnel

Se **já existe** um túnel configurado (usado hoje no notebook):
1. No painel da Cloudflare → **Zero Trust → Networks → Tunnels**, abra o túnel existente.
2. Em **Public Hostname**, adicione (ou edite) uma entrada:
   - **Subdomain**: deixe em branco (para usar a raiz `comunidadecristacurados.com.br`) ou configure conforme preferir.
   - **Domain**: `comunidadecristacurados.com.br`.
   - **Service**: `HTTP` apontando para `whatsapp-bot:3000` (nome do serviço e porta do `docker-compose.bot.yml` — como o túnel roda na mesma rede Docker, usa o nome do container, não o IP).
3. O **token do túnel** (`CLOUDFLARE_TOKEN`) continua o mesmo — não precisa gerar um novo, já que é o mesmo túnel, só mudando pra onde ele aponta (o container vai rodar num servidor diferente, mas o túnel se conecta de qualquer lugar que tenha o token certo).

Se for criar um túnel **novo**: **Zero Trust → Networks → Tunnels → Create a tunnel** → escolha "Cloudflared" → dê um nome → copie o **token** gerado (é o valor que vai na variável `CLOUDFLARE_TOKEN` do `.env`) → configure o Public Hostname como no passo acima.

### 4.3. Conferir o `.env`

No servidor, confira que `~/chatbot/.env` tem a linha:

```
CLOUDFLARE_TOKEN=o_token_do_seu_tunel
```

(Se você copiou o `.env` do notebook no passo 3, isso já deve estar lá.)

---

## 5. Subir o bot na Oracle

No servidor, dentro da pasta `~/chatbot`:

```bash
docker network create chatbot_shared_network  # só na primeira vez, se ainda não existir

docker compose -f docker-compose.bot.yml up -d --build
docker compose -f docker-compose.tunnel.yml up -d
```

Acompanhe os logs pra confirmar que subiu certo:

```bash
docker compose -f docker-compose.bot.yml logs -f
```

Espere ver `✅ Site de controle rodando em http://0.0.0.0:3000` e, se a sessão do WhatsApp foi copiada certinho (`.wwebjs_auth`), `✅ Autenticado no WhatsApp` / `✅ Bot conectado!` sem precisar escanear QR Code de novo.

---

## 6. Testar

1. Acesse `https://comunidadecristacurados.com.br/secretaria/login` no navegador.
2. Faça login com o usuário admin que já existia (veio junto no `dados.db` copiado).
3. Confira a aba "Whatsapp" — deve mostrar "Conectado ✅".
4. Mande uma mensagem de teste pro número do bot pelo WhatsApp e confirme que ele responde.
5. Teste o painel de Líderes/Logs também, pra garantir que os dados vieram certos.

Se o WhatsApp **não** reconectou sozinho (a sessão não foi copiada ou expirou), use o botão "Solicitar QR Code" no painel e escaneie de novo com o celular usado pelo bot.

---

## 7. Desligar o notebook

**Só faça isso depois de confirmar que tudo está funcionando na Oracle** (mensagens sendo respondidas, painel acessível, agendamentos funcionando) — de preferência acompanhando por um dia inteiro antes.

No notebook:

```bash
docker compose -f docker-compose.bot.yml down
docker compose -f docker-compose.tunnel.yml down
```

Depois disso, o notebook pode ser desligado/liberado para outro uso — o bot já está rodando 100% na Oracle.

---

## Notas e cuidados

- **Backup**: antes de mexer em qualquer coisa, vale copiar a pasta inteira do projeto no notebook (com os arquivos `.json` e `.wwebjs_auth`) para um lugar seguro (pendrive, outro HD), só por precaução.
- **Instância Always Free "reclaimable"**: a Oracle pode recuperar (desligar/apagar) instâncias Always Free que ficarem com uso muito baixo por muito tempo, ou se a conta ficar inativa. Pra um bot rodando o tempo todo isso não costuma ser um problema, mas vale saber que existe essa política.
- **Múltiplas instâncias Ampere**: os "4 OCPUs / 24 GB" do Ampere A1 são um orçamento total gratuito — pode ser 1 instância grande (como configuramos aqui) ou várias menores, se um dia precisar rodar outro serviço junto.
- **Landing page futura**: como o painel agora vive em `/secretaria`, a raiz do domínio (`comunidadecristacurados.com.br/`) está livre pra receber uma página institucional/home page quando quiser — hoje ela só redireciona para `/secretaria` como provisório (veja o comentário em `web.js`, na rota `GET /`).
