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
    .links { margin-top: 1rem; text-align: center; font-size: 0.9rem; }
    .links a { color: #007bff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Login</h1>
    <div id="loginError" class="error">${message}</div>
    <form id="loginForm">
      <input name="username" placeholder="Usuário" required />
      <input name="password" type="password" placeholder="Senha" required />
      <button type="submit">Entrar</button>
      <div class="links">Não tem conta? <a href="/register">Cadastre-se</a></div>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      if (res.ok) window.location.href = '/whatsappcontrol';
      else {
        const json = await res.json();
        document.getElementById('loginError').textContent = json.message;
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
  <title>Cadastro - Controle WhatsApp</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 1.5rem; background: #f5f5f5; color: #111; }
    .container { max-width: 420px; margin: 4rem auto; background: #fff; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    input { width: 100%; padding: .8rem; margin: .5rem 0 1rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: .9rem; border: none; border-radius: 8px; background: #28a745; color: #fff; font-size: 1rem; cursor: pointer; }
    .error { color: #dc3545; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Novo Perfil</h1>
    <div id="regError" class="error">${message}</div>
    <form id="regForm">
      <input name="username" placeholder="Usuário" required />
      <input name="password" type="password" placeholder="Senha" required />
      <button type="submit">Criar Conta</button>
      <div style="margin-top:1rem; text-align:center;"><a href="/login">Voltar ao login</a></div>
    </form>
  </div>
  <script>
    document.getElementById('regForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      if (res.ok) { alert('Conta criada!'); window.location.href = '/login'; }
      else {
        const json = await res.json();
        document.getElementById('regError').textContent = json.message;
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
      <div id="qr"></div>
      <button class="primary" id="requestQr">Solicitar QR Code</button>
      <button id="cancelQr">Cancelar</button>
      <button class="danger" id="disconnect">Desconectar</button>
    </div>

    <div id="tab-admin" class="tab-content">
      <h3>Usuários</h3>
      <ul id="userList"></ul>
      <hr>
      <h4>Novo Usuário</h4>
      <form id="addUserForm">
        <input name="username" placeholder="Usuário" required />
        <input name="password" type="password" placeholder="Senha" required />
        <select name="role"><option value="user">Usuário</option><option value="admin">Admin</option></select>
        <button type="submit" class="primary">Adicionar</button>
      </form>
    </div>

    <div id="tab-logs" class="tab-content">
      <h3>Logs</h3>
      <div id="logsContainer"></div>
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

      document.getElementById('status').innerHTML = 'Status: ' + (json.connected ? 'Conectado ✅' : 'Desconectado');
      if (json.hasQr) document.getElementById('qr').innerHTML = '<img src="'+json.qrDataUrl+'" />';
      else document.getElementById('qr').innerHTML = '';

      if (isAdmin) {
        const logs = await fetch('/api/logs').then(r => r.json());
        const cont = document.getElementById('logsContainer');
        cont.textContent = logs.logs;
        cont.scrollTop = cont.scrollHeight;
      }
    }

    async function fetchUsers() {
      const res = await fetch('/api/admin/users').then(r => r.json());
      const list = document.getElementById('userList');
      list.innerHTML = '';
      res.users.forEach(u => {
        const li = document.createElement('li');
        li.innerHTML = '<span>'+u.username+' ('+u.role+')</span>' + 
          (u.role !== 'admin' ? '<button class="danger" onclick="deleteUser(\\''+u.username+'\\')">Excluir</button>' : '');
        list.appendChild(li);
      });
    }

    async function deleteUser(name) {
      if(confirm('Excluir '+name+'?')) {
        await fetch('/api/admin/users/'+name, { method: 'DELETE' });
        fetchUsers();
      }
    }

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      e.target.reset(); fetchUsers();
    });

    document.getElementById('requestQr').onclick = () => fetch('/request-qr', {method:'POST'}).then(refresh);
    document.getElementById('cancelQr').onclick = () => fetch('/cancel-qr', {method:'POST'}).then(refresh);
    document.getElementById('disconnect').onclick = () => { if(confirm('Desconectar?')) fetch('/disconnect', {method:'POST'}).then(refresh); };
    document.getElementById('logout').onclick = () => fetch('/logout', {method:'POST'}).then(() => window.location.href='/login');

    setInterval(refresh, 5000); refresh();
  </script>
</body></html>`;
}

module.exports = { renderLoginHtml, renderRegisterHtml, renderIndexHtml };