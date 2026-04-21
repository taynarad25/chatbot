function renderLoginHtml(message = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login - Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 420px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #007bff; color: #fff; font-size: 1rem; cursor: pointer; }
    .error { color: #dc3545; margin-bottom: 1rem; }
    .info { color: #004085; background-color: #cce5ff; border-color: #b8daff; padding: .75rem 1.25rem; margin-bottom: 1rem; border: 1px solid transparent; border-radius: .25rem; }
    .success { color: #155724; background-color: #d4edda; border-color: #c3e6cb; padding: .75rem 1.25rem; margin-bottom: 1rem; border: 1px solid transparent; border-radius: .25rem; }
    .links { margin-top: 1rem; text-align: center; font-size: 0.9rem; }
    .links a { color: #007bff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Login</h1>
    <div id="loginMessage" class="error">${message}</div>
    <form id="loginForm">
      <input name="username" placeholder="Usuário" required />
      <input name="password" type="password" placeholder="Senha" required />
      <button type="submit">Entrar</button>
      <div class="links">Não tem conta? <a href="/register">Cadastre-se</a></div>
    </form>
  </div>
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const msg = urlParams.get('message');
    if (msg) {
      const loginMessageEl = document.getElementById('loginMessage');
      loginMessageEl.textContent = msg;
      loginMessageEl.className = 'success';
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      if (res.ok) {
        console.log('Login bem-sucedido.');
        window.location.href = '/whatsappcontrol';
      } else {
        const json = await res.json();
        console.error('Falha no login:', json.message);
        document.getElementById('loginMessage').textContent = json.message || 'Erro de login.';
        document.getElementById('loginMessage').className = 'error';
      }
    });
  </script>
</body></html>`;
}

function renderRegisterHtml(message = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Concluir Cadastro - Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 420px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #28a745; color: #fff; font-size: 1rem; cursor: pointer; }
    .error { color: #dc3545; margin-bottom: 1rem; }
    .info { color: #004085; background-color: #cce5ff; border-color: #b8daff; padding: .75rem 1.25rem; margin-bottom: 1rem; border: 1px solid transparent; border-radius: .25rem; }
    .success { color: #155724; background-color: #d4edda; border-color: #c3e6cb; padding: .75rem 1.25rem; margin-bottom: 1rem; border: 1px solid transparent; border-radius: .25rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Concluir Cadastro</h1>
    <div id="regMessage" class="info">${message || 'Defina sua senha para acessar o painel.'}</div>
    <form id="regForm">
      <input name="username" placeholder="Seu usuário (conforme criado pelo Admin)" required />
      <input name="password" type="password" placeholder="Nova Senha" required minlength="6" />
      <input name="confirmPassword" type="password" placeholder="Confirmar Senha" required minlength="6" />
      <button type="submit">Definir Senha e Entrar</button>
      <div style="margin-top:1rem; text-align:center;"><a href="/login">Voltar ao login</a></div>
    </form>
  </div>
  <script>
    document.getElementById('regForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      const msgEl = document.getElementById('regMessage');

      if (data.password !== data.confirmPassword) {
        msgEl.textContent = 'As senhas não coincidem.';
        msgEl.className = 'error';
        return;
      }

      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) {
        console.log('Conta criada com sucesso.');
        msgEl.textContent = json.message || 'Senha definida! Redirecionando...';
        msgEl.className = 'success';
        setTimeout(() => window.location.href = '/login?message=Conta criada com sucesso!', 2000);
      }
      else {
        console.error('Erro no cadastro:', json.message);
        msgEl.textContent = json.message;
        msgEl.className = 'error';
      }
    });
  </script>
</body></html>`;
}

function renderSetPasswordHtml(username, message = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Definir Senha - Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 420px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #007bff; color: #fff; font-size: 1rem; cursor: pointer; }
    .error { color: #dc3545; margin-bottom: 1rem; }
    .info { color: #004085; background-color: #cce5ff; border-color: #b8daff; padding: .75rem 1.25rem; margin-bottom: 1rem; border: 1px solid transparent; border-radius: .25rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Definir Senha para ${username}</h1>
    <div id="setMessage" class="info">${message || 'Por favor, defina sua nova senha.'}</div>
    <form id="setPasswordForm">
      <input type="hidden" name="username" value="${username}" />
      <input name="password" type="password" placeholder="Nova Senha" required minlength="6" />
      <input name="confirmPassword" type="password" placeholder="Confirmar Senha" required minlength="6" />
      <button type="submit">Definir Senha</button>
    </form>
  </div>
  <script>
    document.getElementById('setPasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const password = formData.get('password');
      const confirmPassword = formData.get('confirmPassword');
      const setMessageEl = document.getElementById('setMessage');

      if (password !== confirmPassword) {
        setMessageEl.textContent = 'As senhas não coincidem.';
        setMessageEl.className = 'error';
        return;
      }

      const res = await fetch('/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.get('username'), password: password }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessageEl.textContent = json.message || 'Senha definida com sucesso! Redirecionando...';
        setMessageEl.className = 'success';
        setTimeout(() => window.location.href = '/whatsappcontrol', 2000);
      } else {
        setMessageEl.textContent = json.message || 'Erro ao definir senha.';
        setMessageEl.className = 'error';
      }
    });
  </script>
</body></html>`;
}

function renderIndexHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Controle WhatsApp</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 1rem; background: #f0f2f5; }
    .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.1); }
    .tabs { display: flex; border-bottom: 2px solid #e4e6eb; margin-bottom: 1.5rem; }
    .tab-btn { padding: 1rem; cursor: pointer; border: none; background: none; font-weight: 600; color: #65676b; }
    .tab-btn.active { color: #007bff; border-bottom: 3px solid #007bff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .message-box { padding: 10px; margin-bottom: 10px; border-radius: 5px; }
    button { padding: .8rem; border-radius: 8px; border: none; cursor: pointer; margin-right: 5px; }
    .primary { background: #007bff; color: white; }
    .danger { background: #dc3545; color: white; }
    #logsContainer { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 8px; height: 300px; overflow-y: auto; font-family: monospace; }
    li { background: #f9f9f9; padding: 10px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h1>Painel de Controle</h1>
      <button id="logout">Sair</button>
    </div>
    <div class="tabs">
      <button class="tab-btn active" onclick="openTab(event, 'tab-whatsapp')">Whatsapp</button>
      <button class="tab-btn" id="btn-tab-admin" style="display:none;" onclick="openTab(event, 'tab-admin')">Perfil de acesso</button>
      <button class="tab-btn" id="btn-tab-logs" style="display:none;" onclick="openTab(event, 'tab-logs')">Logs</button>
    </div>
    
    <div id="tab-whatsapp" class="tab-content active">
      <div id="status">Carregando...</div>
      <div id="actionMessage" style="color: #007bff; margin: 0.5rem 0;"></div>
      <div id="qr"></div>
      <button class="primary" id="requestQr" style="display:none">Solicitar QR Code</button>
      <button id="cancelQr" style="display:none">Cancelar QR Code</button>
      <button class="danger" id="disconnect" style="display:none">Desconectar WhatsApp</button>
    </div>

    <div id="tab-admin" class="tab-content">
      <h3>Usuários</h3>
      <ul id="userList"></ul>
      <hr>
      <h4>Novo Usuário</h4>
      <div id="adminMessage" class="message-box" style="display:none;"></div>
      <form id="addUserForm">
        <input name="username" placeholder="Usuário" required />
        <select name="role"><option value="user">Usuário</option><option value="admin">Administrador</option></select>
        <button type="submit" class="primary">Adicionar</button>
      </form>
    </div>

    <div id="tab-logs" class="tab-content">
      <h3>Logs</h3>
      <pre id="logsContainer">Carregando logs...</pre>
    </div>
  </div>

  <script>
    function openTab(evt, name) {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(name).classList.add('active');
      evt.currentTarget.classList.add('active');
      if(name === 'tab-admin') fetchUsers();
    }

    async function refresh() {
      const res = await fetch('/status');
      if (!res.ok) { window.location.href = '/login'; return; }
      const json = await res.json();
      
      const userRes = await fetch('/api/user-info');
      const userJson = await userRes.json();
      const isAdmin = userJson.ok && userJson.user.role === 'admin';
      document.getElementById('btn-tab-admin').style.display = isAdmin ? 'block' : 'none';
      document.getElementById('btn-tab-logs').style.display = isAdmin ? 'block' : 'none';

      const actionMessageEl = document.getElementById('actionMessage');
      actionMessageEl.style.display = 'none'; // Hide previous action messages

      // Lógica de Status e Botões
      const statusText = json.connected ? 'Conectado ✅' : (json.initializing ? 'Inicializando... ⏳' : 'Desconectado');
      document.getElementById('status').innerHTML = '<strong>Status:</strong> ' + statusText;
      
      if (json.hasQr) document.getElementById('qr').innerHTML = '<img src="'+json.qrDataUrl+'" />';
      else document.getElementById('qr').innerHTML = '';

      // Regra de exibição dos botões
      document.getElementById('disconnect').style.display = json.connected ? 'inline-block' : 'none';
      // Mostra cancelar se estiver inicializando ou se já tiver QR, mas não estiver conectado ainda
      document.getElementById('cancelQr').style.display = (json.initializing || (json.hasQr && !json.connected)) ? 'inline-block' : 'none';
      // Mostra solicitar apenas se estiver totalmente parado
      document.getElementById('requestQr').style.display = !json.connected && !json.initializing && !json.hasQr ? 'inline-block' : 'none';

      if (isAdmin) {
        fetch('/api/logs')
          .then(r => r.ok ? r.json() : Promise.reject('Erro no servidor'))
          .then(json => {
            const cont = document.getElementById('logsContainer');
            if (json.ok) {
              cont.textContent = json.logs;
              cont.scrollTop = cont.scrollHeight;
            }
          })
          .catch(err => console.error('Erro ao buscar logs:', err));
      }
    }

    async function fetchUsers() {
      fetch('/api/admin/users')
        .then(r => r.ok ? r.json() : Promise.reject('Erro ao carregar usuários'))
        .then(json => {
          const list = document.getElementById('userList');
          list.innerHTML = '';
          if (json.users) {
            json.users.forEach(u => {
              const li = document.createElement('li');
              li.innerHTML = '<span>'+u.username+' ('+u.role+')</span>' + 
                (u.role !== 'admin' ? '<button class="danger" onclick="deleteUser(\\''+u.username+'\\')">Excluir</button>' : '');
              list.appendChild(li);
            });
          }
        })
        .catch(err => console.error(err));
    }

    async function deleteUser(name) {
      if (confirm('Tem certeza que deseja excluir o usuário ' + name + '?')) {
        console.log('Solicitando exclusão do usuário:', name);
        await fetch('/api/admin/users/'+name, { method: 'DELETE' });
        fetchUsers();
      }
    }

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      console.log('Tentando adicionar novo usuário:', data.username);
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      const msgEl = document.getElementById('adminMessage');
      msgEl.style.display = 'block';
      msgEl.textContent = json.message;
      
      if (res.ok) {
        console.log('Usuário criado com sucesso.');
        msgEl.style.backgroundColor = '#d4edda';
        msgEl.style.color = '#155724';
        e.target.reset();
        fetchUsers();
      } else { 
        console.error('Erro ao criar usuário:', json.message);
        msgEl.style.backgroundColor = '#f8d7da';
        msgEl.style.color = '#721c24';
      }
    });

    document.getElementById('requestQr').onclick = () => {
      console.log('Botão: Solicitar QR Code');
      fetch('/request-qr', {method:'POST'}).then(refresh);
    };
    document.getElementById('cancelQr').onclick = () => {
      console.log('Botão: Cancelar QR Code');
      fetch('/cancel-qr', {method:'POST'}).then(refresh);
    };
    document.getElementById('disconnect').onclick = () => { 
      if(confirm('Desconectar o WhatsApp?')) {
        console.log('Botão: Desconectar');
        fetch('/disconnect', {method:'POST'}).then(refresh); 
      }
    };
    document.getElementById('logout').onclick = () => {
      console.log('Encerrando sessão...');
      fetch('/logout', {method:'POST'}).then(() => window.location.href='/login');
    };

    setInterval(refresh, 5000); refresh();
  </script>
</body></html>`;
}
module.exports = { renderLoginHtml, renderRegisterHtml, renderSetPasswordHtml, renderIndexHtml };