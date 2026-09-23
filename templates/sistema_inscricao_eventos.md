# Guia / Blueprint: Sistema de Inscrição de Eventos com Controle de Vagas

Este documento registra a estrutura reutilizável criada para o evento **Pré-estreia The Chosen**, permitindo que a Comunidade Cristã Curados crie rapidamente novas páginas de inscrição para futuros eventos (conferências, retiros, vigílias, jantares de casais, etc.).

---

## 1. Arquitetura do Sistema

O sistema é composto por 4 camadas isoladas e desacopladas da página inicial (`home.html`):

1. **Módulo Backend (`web/<nome_do_evento>.js`):**
   - Configura o limite total de vagas (ex: `LIMITE_VAGAS = 75`).
   - Define a data de encerramento/expiração (ex: `DATA_EXPIRACAO = new Date('2026-10-04T00:00:00-03:00')`).
   - Persiste as inscrições em formato JSON de forma segura com gravação atômica (`.tmp` + `renameSync`).
   - Valida quantidades, nomes de todos os acompanhantes, telefone (WhatsApp) e e-mail.
   - Gera um código alfanumérico único para cada reserva (ex: `TC-XXXXXX`).

2. **Rotas no Servidor (`web.js`):**
   - `GET /<evento>`: Serve a página HTML se ainda não estiver expirada (caso expirada, retorna 404/encerrada).
   - `GET /<evento>/api/vagas`: Retorna em tempo real `{ total, preenchidas, restantes, esgotado }`.
   - `POST /<evento>/api/inscrever`: Recebe os dados, valida o estoque de vagas de forma atômica e salva.
   - `GET /<evento>/api/inscritos`: Rota protegida pela sessão administrativa da `/secretaria` para exportação.

3. **Página Frontend (`public/<evento>.html` e `web/public/<evento>.html`):**
   - **Banners Responsivos:** Tag `<picture>` com imagem horizontal para computadores e vertical para celulares.
   - **Contador Dinâmico:** Barra de progresso e badge atualizados automaticamente a cada 15 segundos.
   - **Avisos Específicos:** Como regra de idade/crianças de colo.
   - **Campos Dinâmicos:** Seletor de quantidade (1 a N) que gera instantaneamente um campo para cada participante.
   - **Comprovante Digital (Voucher):** Tela de confirmação com código, nomes e botão de compartilhamento no WhatsApp.

4. **Expiração / Auto-remoção Programada:**
   - A função `estaExpirado(data)` compara a data atual com a data limite programada.
   - No dia seguinte ao evento, a rota é automaticamente bloqueada/desativada no servidor sem necessidade de intervenção manual no deploy.

---

## 2. Como Reutilizar para um Novo Evento (Passo a Passo)

Para criar um novo evento (ex: `conferencia-2026`):

1. **Duplicar o Módulo Backend:**
   - Copie `web/the_chosen.js` para `web/conferencia.js`.
   - Altere `LIMITE_VAGAS` e `DATA_EXPIRACAO`.
   - Mude o nome do arquivo JSON para `conferencia_inscricoes.json`.

2. **Criar a Página HTML:**
   - Copie `public/the-chosen.html` para `public/conferencia.html` (e em `web/public/conferencia.html`).
   - Substitua os banners em `/images/conferencia-desktop.jpg` e `/images/conferencia-mobile.jpg`.
   - Ajuste o título, data, horário e descrição.

3. **Registrar as Rotas em `web.js`:**
   - Importe o novo módulo: `const conferencia = require('./web/conferencia');`.
   - Adicione os endpoints `GET /conferencia`, `GET /conferencia/api/vagas` e `POST /conferencia/api/inscrever`.

4. **Testes Automatizados:**
   - Copie `test/the_chosen.test.js` para `test/conferencia.test.js` e execute `node --test test/conferencia.test.js`.
