const { isEventoExpiradoData } = require('./limpeza_eventos');

function renderLoginHtml(message = "") {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Secretaria - Comunidade Cristã Curados</title>
  <link rel="icon" type="image/png" href="/images/logo.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAVTSURBVFhH7ZYLbFNlFMevCig+wO32EXq7oRECIdnargwT1JBA104cRBRwXTeFvdjaTcNLQTCNtOwRGQy7rXsg0Q2QgILIGMpTIm9QYI++xrY4hqMbbZmDDRE4nu/uo1FnCdmDxMRf0tyb//fde873v+ecjfnPItxR84LgQHOS8FCLnq1qiKTyw0FQaVsoONjcLT7XDeILv4PwyK/A7nV+xmyDx+iWwUNQ5ZwuOtYOoqNtwFY6qtlK+1HhwV9A/HMXsFUuE902eAj2OPaTk7N7XVsZgEeIxlY5l4iOe0BQ5fCy39if4TcOFuweR73obCcEVzpVVGKCtp0dic7cFexrBMHuurFUHhwwgR96HHBuoBK64kwhnwWvHUH7G0ZSeeCIV5fNZ5geuwWVjrmiU76ewttjP4JBdwm+qwc+qSpnPv8A4jNwb9LbvjNlinGIVl20Nm3WDtBprJupzLC7bWbh4RYQV98Ccc0fIDqB33+vaydzuOkJsu7Rcxth+Wi4qpd8BEbmUf6hvpAaU/KkNqrop8QZmyBpxmaIjbJk0yV0wq7E6l8mONRsFO5r1FCZcaeN+hiWhAIsDQWPXnK+eaF0OF3qG7ro9SN0mpIz82PK4Z3pG+EtTdErdKkXnnTJ5JvvSQEWh0CHQXqhwyBh6VL/wCSk8ZoSL3FBG1VwjMq9aE/nfiQn78zgrrUuED9H5YEhVlWwODGmAuKjSyFumiWMyn48BmnYjcye07enSZZSeeCIVVkkceqibuJCnLoghcp+0P40cnqvXtLVlhI6isoDR6qyZKg2ytKaMnMrFmPh+1T2gxW/Ej4IhbY0rrlflR8Irco6VqcpvZUYswl0qgItlf1gAonEgWsGrvtqJiel8oMROzVf/IYq/74jFO3fTtoxLsp6U6cp7mVxa0bo8z49dweWhGD7cf4p+W/Uz5OENKQG9UzMhGkWNk5jPZPw6gZPnKbIP9/vMXt23nBsw9J5r30ByTO3YBcUrqNLvWgnAwhduL0whDiRCwzDT8+/4skY9VLXu9JWr4E74NYLn2Zw0qUveH07kNMlRJeRibdTqypKxqEzS6suXBGvLnbMx+BJ5PRq6wUynOi7etGcJA3GwI3EhbuLcBZkcGe86RK9L4ObikNp7jWDpAI14AfVh6MBOyeZMU45PCRWZdVie9lIm5FkyEnJPan4e7+E6NKTpBNorIBcWsCNvZHJ2YgTfCBMhjjC3+N4Jvr1TK7Jh8H/NiXnTDAOi4/eEIuJfK1TFzfp1NZOvHoTNGWnsfgWKZWpQ+lWpiEiN+aiImeNS571pUuR/XlDRM7yixHZSrrMnNQFj+jM5EwYyI51cRPtvo3OuHFAfX89U5rMW38/5szZNix+VrkoSV0WTCWe02ErxzVG5BxvnbgWfJMs8NukQv7njbRAU0QuXIzI2Xpq/DL/+CXt2LVIEtKNBXp36bj+/aNyTmbm6uVZl9sj18NlZR7Y5GZ3ndx01CY3ncL7660T14En8lNwyrOqq8Oyg+hjA0eNzLSLBGjEkzoVWSuaZMZn6RJTq8wJdSmyylqUa/gkamWrvqJLA4NTZpaTwO6J+VAnM/v/JP8TdKLiCjpxCROpDTe9TOX+gy/OJd8cr177uNyA39I2Pot1yFd3EBcw0S1U7j91MtOJjkkF+FLTt1QKiE1mLucTkJvcZ5XGgDPjgTkf/slTGLjNhwkQJ6gcENzzNilU0hV14dkKKvedOoVpNPY8dL9YTBxYReWA1MhNk0m9tCjz7tSEm2dQue8QB+zhZs2VyDXTSDJUDohrzPrHHcrV492KvDG1E4z3Hzj/wzDMn2N8oxpmYIOXAAAAAElFTkSuQmCC" />
  <link rel="manifest" href="/manifest.json" />
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>
    :root {
      --cor-ciano: #00bcd4;
      --cor-roxo: #7b2cbf;
      --cor-laranja: #ff7d00;
      --cor-magenta: #e01a4f;
      --cor-escuro: #101014;
      --cor-card: #18181e;
      --cor-borda: rgba(255, 255, 255, 0.09);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Montserrat', sans-serif; }
    body {
      background: radial-gradient(circle at top, #1a1a24 0%, #0d0d10 100%);
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .container {
      max-width: 440px;
      width: 100%;
      background: var(--cor-card);
      padding: 2.8rem 2.2rem;
      border-radius: 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
      border: 1px solid var(--cor-borda);
      position: relative;
      overflow: hidden;
    }
    .container::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--cor-ciano), var(--cor-roxo), var(--cor-magenta));
    }
    .brand-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .brand-logo {
      width: 68px;
      height: 68px;
      object-fit: contain;
      margin-bottom: 12px;
      filter: drop-shadow(0 6px 14px rgba(0, 188, 212, 0.35));
    }
    .brand-title {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: 2px;
      color: #ffffff;
    }
    .brand-title span {
      color: var(--cor-ciano);
    }
    .brand-subtitle {
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #9ca3af;
      margin-top: 4px;
    }
    .input-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #d1d5db;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 0.95rem 1.1rem;
      margin-bottom: 1.2rem;
      background: #22222a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      font-size: 0.95rem;
      color: #ffffff;
      transition: all 0.25s ease;
    }
    input:focus {
      outline: none;
      border-color: var(--cor-ciano);
      box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.25);
      background: #262630;
    }
    button {
      width: 100%;
      padding: 1rem;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--cor-roxo), #9d4edd);
      color: #ffffff;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(123, 44, 191, 0.4);
      transition: all 0.25s ease;
      margin-top: 0.5rem;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(123, 44, 191, 0.6);
    }
    button:active {
      transform: translateY(0);
    }
    .password-wrapper { position: relative; }
    .toggle-password {
      position: absolute;
      right: 14px;
      top: 13px;
      cursor: pointer;
      user-select: none;
      font-size: 1.1rem;
      opacity: 0.75;
      transition: opacity 0.2s ease;
    }
    .toggle-password:hover { opacity: 1; }
    .error {
      color: #fca5a5;
      background: rgba(220, 38, 38, 0.15);
      border: 1px solid rgba(220, 38, 38, 0.3);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
    }
    .error:empty { display: none; }
    .info {
      color: #93c5fd;
      background: rgba(37, 99, 235, 0.15);
      border: 1px solid rgba(37, 99, 235, 0.3);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
    }
    .success {
      color: #86efac;
      background: rgba(22, 163, 74, 0.15);
      border: 1px solid rgba(22, 163, 74, 0.3);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
    }
    .links {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.88rem;
      color: #9ca3af;
    }
    .links a {
      color: var(--cor-ciano);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }
    .links a:hover {
      color: #67e8f9;
      text-decoration: underline;
    }


  </style>
</head>
<body>
  <div class="container">
    <div class="brand-header">
      <img src="/images/logo.png" alt="Logotipo Curados" class="brand-logo" />
      <h1 class="brand-title"><span>CURADOS</span></h1>
      <p class="brand-subtitle">Secretaria & Gestão Pastoral</p>
    </div>



    <div id="loginMessage" class="error">${message}</div>
    <form id="loginForm">
      <label class="input-label" for="loginUsername">Usuário</label>
      <input id="loginUsername" name="username" placeholder="Digite seu usuário" required autocomplete="username" />
      
      <label class="input-label" for="password">Senha</label>
      <div class="password-wrapper">
        <input id="password" name="password" type="password" placeholder="Digite sua senha" required autocomplete="current-password" />
        <span id="togglePassword" class="toggle-password" title="Ver senha">👀</span>
      </div>
      
      <div style="display:flex; align-items:center; gap:8px; margin: 12px 0 16px 0; font-size: 0.85rem; color: #a1a1aa;">
        <input type="checkbox" id="rememberMe" name="rememberMe" checked style="width: auto; margin: 0; cursor: pointer;" />
        <label for="rememberMe" style="cursor: pointer; user-select: none;">Permanecer conectado neste navegador</label>
      </div>
      
      <button type="submit">Acessar Painel</button>
      <div class="links">
        Primeiro acesso como líder? <a href="/secretaria/register">Concluir cadastro</a>
      </div>
    </form>
  </div>
  <script>
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      togglePassword.textContent = type === 'password' ? '👀' : '🙈';
    });

    const urlParams = new URLSearchParams(window.location.search);
    const msg = urlParams.get('message');
    if (msg) {
      const loginMessageEl = document.getElementById('loginMessage');
      loginMessageEl.textContent = msg;
      loginMessageEl.className = 'success';
    }

    const savedUser = localStorage.getItem('curados_secretaria_usuario');
    if (savedUser) {
      const userEl = document.getElementById('loginUsername');
      if (userEl) {
        userEl.value = savedUser;
        passwordInput.focus();
      }
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      const res = await fetch('/secretaria/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        console.log('Login bem-sucedido.');
        const rememberEl = document.getElementById('rememberMe');
        if (rememberEl && rememberEl.checked) {
          localStorage.setItem('curados_secretaria_usuario', data.username || '');
        } else {
          localStorage.removeItem('curados_secretaria_usuario');
        }
        window.location.href = '/secretaria';
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
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Concluir Cadastro - Comunidade Cristã Curados</title>
  <link rel="icon" type="image/png" href="/images/logo.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAVTSURBVFhH7ZYLbFNlFMevCig+wO32EXq7oRECIdnargwT1JBA104cRBRwXTeFvdjaTcNLQTCNtOwRGQy7rXsg0Q2QgILIGMpTIm9QYI++xrY4hqMbbZmDDRE4nu/uo1FnCdmDxMRf0tyb//fde873v+ecjfnPItxR84LgQHOS8FCLnq1qiKTyw0FQaVsoONjcLT7XDeILv4PwyK/A7nV+xmyDx+iWwUNQ5ZwuOtYOoqNtwFY6qtlK+1HhwV9A/HMXsFUuE902eAj2OPaTk7N7XVsZgEeIxlY5l4iOe0BQ5fCy39if4TcOFuweR73obCcEVzpVVGKCtp0dic7cFexrBMHuurFUHhwwgR96HHBuoBK64kwhnwWvHUH7G0ZSeeCIV5fNZ5geuwWVjrmiU76ewttjP4JBdwm+qwc+qSpnPv8A4jNwb9LbvjNlinGIVl20Nm3WDtBprJupzLC7bWbh4RYQV98Ccc0fIDqB33+vaydzuOkJsu7Rcxth+Wi4qpd8BEbmUf6hvpAaU/KkNqrop8QZmyBpxmaIjbJk0yV0wq7E6l8mONRsFO5r1FCZcaeN+hiWhAIsDQWPXnK+eaF0OF3qG7ro9SN0mpIz82PK4Z3pG+EtTdErdKkXnnTJ5JvvSQEWh0CHQXqhwyBh6VL/wCSk8ZoSL3FBG1VwjMq9aE/nfiQn78zgrrUuED9H5YEhVlWwODGmAuKjSyFumiWMyn48BmnYjcye07enSZZSeeCIVVkkceqibuJCnLoghcp+0P40cnqvXtLVlhI6isoDR6qyZKg2ytKaMnMrFmPh+1T2gxW/Ej4IhbY0rrlflR8Irco6VqcpvZUYswl0qgItlf1gAonEgWsGrvtqJiel8oMROzVf/IYq/74jFO3fTtoxLsp6U6cp7mVxa0bo8z49dweWhGD7cf4p+W/Uz5OENKQG9UzMhGkWNk5jPZPw6gZPnKbIP9/vMXt23nBsw9J5r30ByTO3YBcUrqNLvWgnAwhduL0whDiRCwzDT8+/4skY9VLXu9JWr4E74NYLn2Zw0qUveH07kNMlRJeRibdTqypKxqEzS6suXBGvLnbMx+BJ5PRq6wUynOi7etGcJA3GwI3EhbuLcBZkcGe86RK9L4ObikNp7jWDpAI14AfVh6MBOyeZMU45PCRWZdVie9lIm5FkyEnJPan4e7+E6NKTpBNorIBcWsCNvZHJ2YgTfCBMhjjC3+N4Jvr1TK7Jh8H/NiXnTDAOi4/eEIuJfK1TFzfp1NZOvHoTNGWnsfgWKZWpQ+lWpiEiN+aiImeNS571pUuR/XlDRM7yixHZSrrMnNQFj+jM5EwYyI51cRPtvo3OuHFAfX89U5rMW38/5szZNix+VrkoSV0WTCWe02ErxzVG5BxvnbgWfJMs8NukQv7njbRAU0QuXIzI2Xpq/DL/+CXt2LVIEtKNBXp36bj+/aNyTmbm6uVZl9sj18NlZR7Y5GZ3ndx01CY3ncL7660T14En8lNwyrOqq8Oyg+hjA0eNzLSLBGjEkzoVWSuaZMZn6RJTq8wJdSmyylqUa/gkamWrvqJLA4NTZpaTwO6J+VAnM/v/JP8TdKLiCjpxCROpDTe9TOX+gy/OJd8cr177uNyA39I2Pot1yFd3EBcw0S1U7j91MtOJjkkF+FLTt1QKiE1mLucTkJvcZ5XGgDPjgTkf/slTGLjNhwkQJ6gcENzzNilU0hV14dkKKvedOoVpNPY8dL9YTBxYReWA1MhNk0m9tCjz7tSEm2dQue8QB+zhZs2VyDXTSDJUDohrzPrHHcrV492KvDG1E4z3Hzj/wzDMn2N8oxpmYIOXAAAAAElFTkSuQmCC" />
  <link rel="manifest" href="/manifest.json" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>
    :root {
      --cor-ciano: #00bcd4;
      --cor-roxo: #7b2cbf;
      --cor-laranja: #ff7d00;
      --cor-magenta: #e01a4f;
      --cor-escuro: #101014;
      --cor-card: #18181e;
      --cor-borda: rgba(255, 255, 255, 0.09);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Montserrat', sans-serif; }
    body {
      background: radial-gradient(circle at top, #1a1a24 0%, #0d0d10 100%);
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .container {
      max-width: 440px;
      width: 100%;
      background: var(--cor-card);
      padding: 2.8rem 2.2rem;
      border-radius: 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
      border: 1px solid var(--cor-borda);
      position: relative;
      overflow: hidden;
    }
    .container::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--cor-laranja), var(--cor-magenta));
    }
    .brand-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .brand-logo {
      width: 68px;
      height: 68px;
      object-fit: contain;
      margin-bottom: 12px;
      filter: drop-shadow(0 6px 14px rgba(255, 125, 0, 0.35));
    }
    .brand-title {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: 2px;
      color: #ffffff;
    }
    .brand-title span {
      color: var(--cor-laranja);
    }
    .brand-subtitle {
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #9ca3af;
      margin-top: 4px;
    }
    .input-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #d1d5db;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 0.95rem 1.1rem;
      margin-bottom: 1.2rem;
      background: #22222a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      font-size: 0.95rem;
      color: #ffffff;
      transition: all 0.25s ease;
    }
    input:focus {
      outline: none;
      border-color: var(--cor-laranja);
      box-shadow: 0 0 0 3px rgba(255, 125, 0, 0.25);
      background: #262630;
    }
    button {
      width: 100%;
      padding: 1rem;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--cor-laranja), var(--cor-magenta));
      color: #ffffff;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(255, 125, 0, 0.35);
      transition: all 0.25s ease;
      margin-top: 0.5rem;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(255, 125, 0, 0.55);
    }
    button:active {
      transform: translateY(0);
    }
    .password-wrapper { position: relative; }
    .toggle-password {
      position: absolute;
      right: 14px;
      top: 13px;
      cursor: pointer;
      user-select: none;
      font-size: 1.1rem;
      opacity: 0.75;
      transition: opacity 0.2s ease;
    }
    .toggle-password:hover { opacity: 1; }
    .error {
      color: #fca5a5;
      background: rgba(220, 38, 38, 0.15);
      border: 1px solid rgba(220, 38, 38, 0.3);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
    }
    .info {
      color: #93c5fd;
      background: rgba(37, 99, 235, 0.15);
      border: 1px solid rgba(37, 99, 235, 0.3);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
    }
    .success {
      color: #86efac;
      background: rgba(22, 163, 74, 0.15);
      border: 1px solid rgba(22, 163, 74, 0.3);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: center;
    }
    .links {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.88rem;
      color: #9ca3af;
    }
    .links a {
      color: var(--cor-laranja);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }
    .links a:hover {
      color: #fdba74;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand-header">
      <img src="/images/logo.png" alt="Logotipo Curados" class="brand-logo" />
      <h1 class="brand-title"><span>CURADOS</span></h1>
      <p class="brand-subtitle">Concluir Cadastro de Líder</p>
    </div>

    <div id="regMessage" class="info">${message || 'Defina sua senha pessoal para acessar o painel.'}</div>
    <form id="regForm">
      <label class="input-label" for="regUsername">Seu Usuário</label>
      <input id="regUsername" name="username" placeholder="Usuário cadastrado pelo Admin" required autocomplete="username" />
      
      <label class="input-label" for="password">Nova Senha</label>
      <div class="password-wrapper">
        <input id="password" name="password" type="password" placeholder="Mínimo 6 caracteres" required minlength="6" autocomplete="new-password" />
        <span id="togglePassword" class="toggle-password" title="Ver senha">👀</span>
      </div>

      <label class="input-label" for="confirmPassword">Confirmar Nova Senha</label>
      <input id="confirmPassword" name="confirmPassword" type="password" placeholder="Repita a nova senha" required minlength="6" autocomplete="new-password" />
      
      <button type="submit">Definir Senha e Entrar</button>
      <div class="links">
        Já possui senha? <a href="/secretaria/login">Voltar ao login</a>
      </div>
    </form>
  </div>
  <script>
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      togglePassword.textContent = type === 'password' ? '👀' : '🙈';
    });

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

      const res = await fetch('/secretaria/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) {
        console.log('Conta criada com sucesso.');
        msgEl.textContent = json.message || 'Senha definida! Redirecionando...';
        msgEl.className = 'success';
        setTimeout(() => window.location.href = '/secretaria/login?message=Conta criada com sucesso!', 2000);
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

function renderIndexHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Secretaria & Gestão - Comunidade Cristã Curados</title>
  <link rel="icon" type="image/png" href="/images/logo.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAVTSURBVFhH7ZYLbFNlFMevCig+wO32EXq7oRECIdnargwT1JBA104cRBRwXTeFvdjaTcNLQTCNtOwRGQy7rXsg0Q2QgILIGMpTIm9QYI++xrY4hqMbbZmDDRE4nu/uo1FnCdmDxMRf0tyb//fde873v+ecjfnPItxR84LgQHOS8FCLnq1qiKTyw0FQaVsoONjcLT7XDeILv4PwyK/A7nV+xmyDx+iWwUNQ5ZwuOtYOoqNtwFY6qtlK+1HhwV9A/HMXsFUuE902eAj2OPaTk7N7XVsZgEeIxlY5l4iOe0BQ5fCy39if4TcOFuweR73obCcEVzpVVGKCtp0dic7cFexrBMHuurFUHhwwgR96HHBuoBK64kwhnwWvHUH7G0ZSeeCIV5fNZ5geuwWVjrmiU76ewttjP4JBdwm+qwc+qSpnPv8A4jNwb9LbvjNlinGIVl20Nm3WDtBprJupzLC7bWbh4RYQV98Ccc0fIDqB33+vaydzuOkJsu7Rcxth+Wi4qpd8BEbmUf6hvpAaU/KkNqrop8QZmyBpxmaIjbJk0yV0wq7E6l8mONRsFO5r1FCZcaeN+hiWhAIsDQWPXnK+eaF0OF3qG7ro9SN0mpIz82PK4Z3pG+EtTdErdKkXnnTJ5JvvSQEWh0CHQXqhwyBh6VL/wCSk8ZoSL3FBG1VwjMq9aE/nfiQn78zgrrUuED9H5YEhVlWwODGmAuKjSyFumiWMyn48BmnYjcye07enSZZSeeCIVVkkceqibuJCnLoghcp+0P40cnqvXtLVlhI6isoDR6qyZKg2ytKaMnMrFmPh+1T2gxW/Ej4IhbY0rrlflR8Irco6VqcpvZUYswl0qgItlf1gAonEgWsGrvtqJiel8oMROzVf/IYq/74jFO3fTtoxLsp6U6cp7mVxa0bo8z49dweWhGD7cf4p+W/Uz5OENKQG9UzMhGkWNk5jPZPw6gZPnKbIP9/vMXt23nBsw9J5r30ByTO3YBcUrqNLvWgnAwhduL0whDiRCwzDT8+/4skY9VLXu9JWr4E74NYLn2Zw0qUveH07kNMlRJeRibdTqypKxqEzS6suXBGvLnbMx+BJ5PRq6wUynOi7etGcJA3GwI3EhbuLcBZkcGe86RK9L4ObikNp7jWDpAI14AfVh6MBOyeZMU45PCRWZdVie9lIm5FkyEnJPan4e7+E6NKTpBNorIBcWsCNvZHJ2YgTfCBMhjjC3+N4Jvr1TK7Jh8H/NiXnTDAOi4/eEIuJfK1TFzfp1NZOvHoTNGWnsfgWKZWpQ+lWpiEiN+aiImeNS571pUuR/XlDRM7yixHZSrrMnNQFj+jM5EwYyI51cRPtvo3OuHFAfX89U5rMW38/5szZNix+VrkoSV0WTCWe02ErxzVG5BxvnbgWfJMs8NukQv7njbRAU0QuXIzI2Xpq/DL/+CXt2LVIEtKNBXp36bj+/aNyTmbm6uVZl9sj18NlZR7Y5GZ3ndx01CY3ncL7660T14En8lNwyrOqq8Oyg+hjA0eNzLSLBGjEkzoVWSuaZMZn6RJTq8wJdSmyylqUa/gkamWrvqJLA4NTZpaTwO6J+VAnM/v/JP8TdKLiCjpxCROpDTe9TOX+gy/OJd8cr177uNyA39I2Pot1yFd3EBcw0S1U7j91MtOJjkkF+FLTt1QKiE1mLucTkJvcZ5XGgDPjgTkf/slTGLjNhwkQJ6gcENzzNilU0hV14dkKKvedOoVpNPY8dL9YTBxYReWA1MhNk0m9tCjz7tSEm2dQue8QB+zhZs2VyDXTSDJUDohrzPrHHcrV492KvDG1E4z3Hzj/wzDMn2N8oxpmYIOXAAAAAElFTkSuQmCC" />
  <link rel="manifest" href="/manifest.json" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>
    :root {
      --cor-ciano: #00bcd4;
      --cor-ciano-brilho: rgba(0, 188, 212, 0.18);
      --cor-roxo: #7b2cbf;
      --cor-roxo-brilho: rgba(123, 44, 191, 0.25);
      --cor-laranja: #ff7d00;
      --cor-magenta: #e01a4f;
      --cor-escuro: #0e0e12;
      --cor-card: #18181f;
      --cor-card-alt: #202028;
      --cor-borda: rgba(255, 255, 255, 0.08);
      --cor-texto: #f3f4f6;
      --cor-texto-mutado: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Montserrat', sans-serif; }
    body {
      background-color: var(--cor-escuro);
      color: var(--cor-texto);
      margin: 0;
      padding: 1.5rem;
      min-height: 100vh;
    }
    .container {
      max-width: 1260px;
      width: 100%;
      margin: 0 auto;
      background: var(--cor-card);
      padding: 2.2rem;
      border-radius: 24px;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.45);
      border: 1px solid var(--cor-borda);
      position: relative;
    }
    .container::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--cor-ciano), var(--cor-roxo), var(--cor-magenta));
      border-radius: 24px 24px 0 0;
    }
    .header-painel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.2rem;
      border-bottom: 1px solid var(--cor-borda);
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo-small {
      width: 44px;
      height: 44px;
      object-fit: contain;
    }
    .brand-text h1 {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #ffffff;
      margin: 0;
    }
    .brand-text h1 span {
      color: var(--cor-ciano);
    }
    .brand-text p {
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--cor-texto-mutado);
      margin: 0;
    }
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--cor-borda);
      margin-bottom: 2rem;
      overflow-x: auto;
    }
    .tab-btn {
      padding: 0.85rem 1.4rem;
      cursor: pointer;
      border: none;
      background: none;
      font-weight: 600;
      font-size: 0.92rem;
      color: var(--cor-texto-mutado);
      border-radius: 12px 12px 0 0;
      transition: all 0.2s ease;
      position: relative;
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.04);
    }
    .tab-btn.active {
      color: var(--cor-ciano);
      font-weight: 700;
      background: rgba(0, 188, 212, 0.08);
      border-bottom: 3px solid var(--cor-ciano);
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; animation: fadeIn 0.25s ease-out; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .section-title-tab {
      font-size: 1.25rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 1.2rem;
      letter-spacing: -0.3px;
    }
    .evento-card-item {
      background: linear-gradient(135deg, rgba(123, 44, 191, 0.14), rgba(0, 188, 212, 0.10));
      border: 1px solid rgba(0, 188, 212, 0.35);
      border-radius: 18px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      transition: all 0.3s ease;
    }
    .btn-gaveta-toggle {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      padding: 9px 15px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.85rem;
      border: 1px solid rgba(255, 255, 255, 0.22);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      transition: all 0.2s ease;
      width: auto;
      margin-top: 0;
    }
    .btn-gaveta-toggle:hover {
      background: rgba(255, 255, 255, 0.22);
      transform: translateY(-1px);
    }
    .gaveta-arrow {
      display: inline-block;
      font-size: 0.95rem;
      font-weight: bold;
      transition: transform 0.25s ease;
    }
    .evento-gaveta-body {
      transition: opacity 0.25s ease;
      opacity: 1;
      margin-top: 1rem;
    }
    .evento-gaveta-body.recolhida {
      display: none;
      opacity: 0;
    }
    .evento-metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-top: 1rem;
    }
    .evento-metric-box {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 10px 14px;
      text-align: center;
    }
    .evento-metric-val {
      font-size: 1.35rem;
      font-weight: 800;
      color: #fff;
    }
    .evento-metric-lbl {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--cor-texto-mutado);
      margin-top: 2px;
    }
    .evento-toolbar {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 1.2rem;
    }
    .evento-search-input {
      flex: 1;
      min-width: 240px;
      padding: 0.75rem 1rem;
      background: #1e1e26;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: #fff;
      font-size: 0.9rem;
    }
    .evento-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .evento-table th {
      background: rgba(255, 255, 255, 0.04);
      color: var(--cor-texto-mutado);
      font-size: 0.78rem;
      text-transform: uppercase;
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--cor-borda);
    }
    .evento-table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      vertical-align: middle;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 700;
    }
    .status-confirmado { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .status-pendente { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
    .status-cancelado { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .message-box {
      padding: 12px 16px;
      margin-bottom: 1rem;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    button {
      padding: 0.75rem 1.4rem;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.9rem;
      transition: all 0.2s ease;
      background: #2b2b36;
      color: #ffffff;
    }
    button:hover {
      background: #383846;
      transform: translateY(-1px);
    }
    button:active {
      transform: translateY(0);
    }
    .primary {
      background: linear-gradient(135deg, var(--cor-roxo), #9d4edd);
      color: #ffffff;
      font-weight: 700;
      box-shadow: 0 4px 14px var(--cor-roxo-brilho);
    }
    .primary:hover {
      background: linear-gradient(135deg, #8a34d6, #ad5eff);
      box-shadow: 0 6px 18px rgba(123, 44, 191, 0.45);
    }
    .danger {
      background: var(--cor-magenta);
      color: #ffffff;
      font-weight: 600;
    }
    .danger:hover {
      background: #c51443;
    }
    #logout {
      background: rgba(224, 26, 79, 0.12);
      color: #f87171;
      border: 1px solid rgba(224, 26, 79, 0.3);
      font-size: 0.85rem;
      padding: 0.55rem 1.2rem;
    }
    #logout:hover {
      background: var(--cor-magenta);
      color: #ffffff;
    }
    .header-user-badge {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.04);
      padding: 4px 12px 4px 6px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      margin-left: auto;
      margin-right: 12px;
    }
    .header-user-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--cor-ciano);
      box-shadow: 0 0 10px rgba(0, 188, 212, 0.3);
    }
    .header-user-meta {
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .header-user-greeting {
      font-size: 0.70rem;
      color: #9ca3af;
      font-weight: 500;
      line-height: 1.1;
    }
    .header-user-name {
      font-size: 0.85rem;
      color: #ffffff;
      font-weight: 700;
      line-height: 1.2;
    }
    #status {
      font-size: 1.05rem;
      padding: 16px 20px;
      background: var(--cor-card-alt);
      border-radius: 14px;
      border: 1px solid var(--cor-borda);
      margin-bottom: 1rem;
      display: inline-block;
      width: 100%;
    }
    #qr {
      margin: 1.5rem 0;
      padding: 1.5rem;
      background: #ffffff;
      border-radius: 18px;
      display: inline-block;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    }
    #qr:empty { display: none; }
    #qr img { display: block; max-width: 250px; height: auto; }
    #logsContainer {
      background: #09090c;
      color: #34d399;
      padding: 1.2rem;
      border-radius: 14px;
      height: 380px;
      overflow-y: auto;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 0.88rem;
      line-height: 1.5;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    ul { list-style: none; }
    li {
      background: var(--cor-card-alt);
      padding: 14px 18px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 12px;
      border: 1px solid var(--cor-borda);
      font-size: 0.95rem;
      transition: background 0.2s ease;
    }
    li:hover {
      background: #252530;
    }
    .filtros-lideres {
      display: flex;
      gap: 12px;
      margin-bottom: 1.4rem;
    }
    .filtros-lideres input { flex: 1; margin-bottom: 0; }
    input, select {
      width: 100%;
      padding: 0.85rem 1rem;
      margin: 0.4rem 0 1rem;
      background: #202028;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      font-size: 0.95rem;
      color: #ffffff;
      transition: all 0.2s ease;
    }
    input:focus, select:focus {
      outline: none;
      border-color: var(--cor-ciano);
      box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.2);
    }
    select { cursor: pointer; }
    hr {
      border: none;
      height: 1px;
      background: var(--cor-borda);
      margin: 2rem 0;
    }
    .cargos-container {
      margin: 0.8rem 0 1.2rem;
      padding: 1.1rem;
      background: var(--cor-card-alt);
      border: 1px solid var(--cor-borda);
      border-radius: 12px;
    }
    .cargos-title {
      display: block;
      font-weight: 700;
      margin-bottom: 0.75rem;
      font-size: 0.88rem;
      color: #e5e7eb;
    }
    .cargos-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
    }
    .cargos-checkboxes label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 0.92rem;
      font-weight: 600;
      color: #d1d5db;
      user-select: none;
    }
    .cargos-checkboxes input[type="checkbox"] {
      width: auto;
      margin: 0;
      cursor: pointer;
      accent-color: var(--cor-ciano);
      transform: scale(1.15);
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 6px;
      vertical-align: middle;
    }
    .badge-lider { background: rgba(0, 188, 212, 0.15); color: #00bcd4; border: 1px solid rgba(0, 188, 212, 0.35); }
    .badge-pastor { background: rgba(255, 125, 0, 0.15); color: #ff7d00; border: 1px solid rgba(255, 125, 0, 0.35); }
    .badge-diretor { background: rgba(123, 44, 191, 0.18); color: #c084fc; border: 1px solid rgba(123, 44, 191, 0.35); }
    .badge-membro { background: rgba(255, 255, 255, 0.08); color: #9ca3af; border: 1px solid rgba(255, 255, 255, 0.15); }
    .badge-depto { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }
    /* Layout em 2 colunas para Usuários & Cargos */
    .lideres-grid-layout {
      display: grid;
      grid-template-columns: 1fr 440px;
      gap: 28px;
      align-items: start;
    }
    .lideres-col-lista {
      min-width: 0;
    }
    .lideres-col-form {
      min-width: 0;
    }
    .form-sticky-card {
      position: sticky;
      top: 24px;
      background: var(--cor-card-alt);
      border: 1px solid var(--cor-borda);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }
    .form-sticky-card.editando-destaque {
      border-color: var(--cor-ciano) !important;
      box-shadow: 0 0 20px rgba(0, 188, 212, 0.35) !important;
      animation: pulseHighlight 0.8s ease-in-out;
    }
    @keyframes pulseHighlight {
      0% { transform: scale(1); }
      50% { transform: scale(1.02); }
      100% { transform: scale(1); }
    }
    .lideres-lista-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.2rem;
      flex-wrap: wrap;
      gap: 12px;
    }
    .lideres-contador {
      font-size: 0.85rem;
      color: var(--cor-texto-mutado);
      font-weight: 500;
      display: block;
    }
    .btn-novo-usuario {
      background: rgba(0, 188, 212, 0.12);
      color: var(--cor-ciano);
      border: 1px solid rgba(0, 188, 212, 0.3);
      padding: 0.55rem 1.1rem;
      font-size: 0.86rem;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s ease;
    }
    .btn-novo-usuario:hover {
      background: var(--cor-ciano);
      color: #000000;
      border-color: var(--cor-ciano);
      transform: translateY(-1px);
    }
    .form-header-flex {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--cor-borda);
    }
    .badge-modo-edicao {
      background: rgba(0, 188, 212, 0.15);
      color: var(--cor-ciano);
      border: 1px solid rgba(0, 188, 212, 0.4);
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .lider-cards-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
    }
    .lider-card {
      background: var(--cor-card-alt);
      border: 1px solid var(--cor-borda);
      border-radius: 14px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }
    .lider-card:hover {
      background: #242430;
      border-color: rgba(255, 255, 255, 0.16);
    }
    .lider-card.card-em-edicao {
      border-color: var(--cor-ciano);
      background: rgba(0, 188, 212, 0.05);
      box-shadow: 0 0 14px rgba(0, 188, 212, 0.22);
    }
    .lider-card-topo {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 10px;
    }
    .lider-card-identificacao {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .lider-card-nome-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .lider-card-nome {
      font-size: 1.05rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.2px;
    }
    .lider-card-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 0.85rem;
      color: var(--cor-texto-mutado);
    }
    .lider-card-meta .meta-tel {
      color: #d1d5db;
      font-family: monospace;
      font-size: 0.88rem;
    }
    .badge-aniversario {
      background: rgba(236, 72, 153, 0.15);
      color: #f472b6;
      border: 1px solid rgba(236, 72, 153, 0.35);
      font-size: 0.74rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .lider-card-acoes {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .btn-card-edit {
      background: #2f2f3d;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 6px 12px;
      font-size: 0.82rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
    }
    .btn-card-edit:hover {
      background: var(--cor-ciano);
      color: #000000;
      border-color: var(--cor-ciano);
    }
    .btn-card-delete {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
      padding: 6px 10px;
      font-size: 0.82rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-card-delete:hover {
      background: #ef4444;
      color: #ffffff;
    }
    .lider-card-detalhes {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lider-detalhe-linha {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.85rem;
    }
    .lider-detalhe-rotulo {
      font-size: 0.75rem;
      font-weight: 700;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      min-width: 82px;
      padding-top: 3px;
      flex-shrink: 0;
    }
    .lider-detalhe-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .lider-detalhe-vazio {
      color: #71717a;
      font-style: italic;
      font-size: 0.8rem;
    }
    @media (max-width: 980px) {
      .lideres-grid-layout {
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .form-sticky-card {
        position: static;
        top: auto;
      }
    }
    @media (max-width: 600px) {
      .header-painel { flex-direction: column; align-items: flex-start; gap: 14px; }
      .filtros-lideres { flex-direction: column; gap: 0; }
      .lider-card-topo { flex-direction: column; align-items: flex-start; }
      .lider-card-acoes { width: 100%; justify-content: flex-end; }
    }

    /* Header Live WhatsApp Status */
    .header-whatsapp-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      background: rgba(34, 197, 94, 0.12);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
      transition: all 0.2s ease;
    }
    .header-whatsapp-pill.desconectado {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.35);
    }
    .header-whatsapp-pill.aguardando {
      background: rgba(234, 179, 8, 0.15);
      color: #fde047;
      border-color: rgba(234, 179, 8, 0.35);
    }

    /* Toast Notification Floating */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 999999;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 0.88rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .toast.sucesso {
      background: #064e3b;
      color: #a7f3d0;
      border: 1px solid #059669;
    }
    .toast.erro {
      background: #7f1d1d;
      color: #fecaca;
      border: 1px solid #dc2626;
    }
    .toast.info {
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid #0284c7;
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    /* Gerenciador Dinâmico de Eventos */
    .eventos-dashboard-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 1.8rem;
    }
    .stat-card-evento {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .stat-card-evento-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      background: rgba(0, 188, 212, 0.12);
      color: var(--cor-ciano);
      border: 1px solid rgba(0, 188, 212, 0.25);
    }
    .stat-card-evento-num {
      font-size: 1.6rem;
      font-weight: 800;
      color: #fff;
      line-height: 1.1;
    }
    .stat-card-evento-label {
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--cor-texto-mutado);
      margin-top: 2px;
    }

    .btn-destaque-novo-evento {
      background: linear-gradient(135deg, #00bcd4, #7b2cbf);
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 14px;
      font-weight: 800;
      font-size: 0.95rem;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 9px;
      box-shadow: 0 6px 20px rgba(0, 188, 212, 0.35);
      transition: all 0.2s ease;
    }
    .btn-destaque-novo-evento:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(0, 188, 212, 0.5);
    }

    .box-editor-evento {
      background: linear-gradient(145deg, #181822, #14141c);
      border: 1px solid rgba(0, 188, 212, 0.4);
      border-radius: 20px;
      padding: 2rem;
      margin-bottom: 2.2rem;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
      animation: fadeIn 0.25s ease-out;
    }

    .modo-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin: 1rem 0 1.5rem;
    }
    .modo-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .modo-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .modo-card.selected {
      background: rgba(0, 188, 212, 0.12);
      border-color: var(--cor-ciano);
      box-shadow: 0 0 18px rgba(0, 188, 212, 0.2);
    }
    .modo-card-title {
      font-weight: 800;
      font-size: 0.95rem;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modo-card-desc {
      font-size: 0.8rem;
      color: var(--cor-texto-mutado);
      line-height: 1.4;
    }

    .pergunta-row {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr 180px 140px 40px;
      gap: 10px;
      align-items: center;
    }
    @media (max-width: 768px) {
      .pergunta-row { grid-template-columns: 1fr; }
    }

    .banner-preview-box {
      width: 100%;
      height: 180px;
      border: 2px dashed rgba(255, 255, 255, 0.15);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      background: rgba(0, 0, 0, 0.2);
      overflow: hidden;
      position: relative;
      transition: all 0.2s ease;
    }
    .banner-preview-box:hover {
      border-color: var(--cor-ciano);
      background: rgba(0, 188, 212, 0.04);
    }
    .banner-preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: none;
    }

    .grid-eventos-dinamicos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 18px;
      margin-bottom: 2.5rem;
    }
    .card-evento-dinamico {
      background: var(--cor-card-alt);
      border: 1px solid var(--cor-borda);
      border-radius: 18px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      transition: all 0.25s ease;
    }
    .card-evento-dinamico:hover {
      border-color: rgba(0, 188, 212, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    }
    .card-evento-dinamico-thumb {
      width: 100%;
      height: 160px;
      object-fit: cover;
      background: #111;
      display: block;
    }
    .card-evento-dinamico-body {
      padding: 1.3rem;
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 8px;
    }
    .card-evento-dinamico-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .card-evento-dinamico-acoes {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    /* Modal Gaveta de Inscritos */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 1.5rem;
      animation: fadeIn 0.2s ease-out;
    }
    .modal-container {
      background: #16161e;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      max-width: 1100px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
    }
    .modal-header {
      padding: 1.5rem 1.8rem;
      border-bottom: 1px solid var(--cor-borda);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-body {
      padding: 1.8rem;
      overflow-y: auto;
      flex: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-painel">
      <div class="brand-group">
        <img src="/images/logo.png" alt="Logotipo Curados" class="brand-logo-small" />
        <div class="brand-text">
          <h1><span>CURADOS</span></h1>
          <p>Secretaria & Painel de Controle</p>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
        <div class="header-whatsapp-pill" id="headerWhatsappPill">
          <span style="font-size:0.9rem;">●</span> <span id="headerWhatsappText">WhatsApp Conectando...</span>
        </div>
        <div class="header-user-badge" id="headerUserBadge" style="display:none;">
          <img id="headerUserAvatar" src="" class="header-user-avatar" alt="Foto Pastoral" />
          <div class="header-user-meta">
            <span class="header-user-greeting">Graça e Paz,</span>
            <span class="header-user-name" id="headerUserName"></span>
          </div>
        </div>
        <button id="logout">Sair do Painel</button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="openTab(event, 'tab-whatsapp')">💬 WhatsApp & Bot</button>
      <button class="tab-btn" id="btn-tab-eventos" onclick="openTab(event, 'tab-eventos')">📅 Gestão de Eventos</button>
      <button class="tab-btn" id="btn-tab-admin" style="display:none;" onclick="openTab(event, 'tab-admin')">👥 Usuários</button>
      <button class="tab-btn" id="btn-tab-lideres" style="display:none;" onclick="openTab(event, 'tab-lideres')">👔 Líderes e Cargos</button>
      <button class="tab-btn" id="btn-tab-logs" style="display:none;" onclick="openTab(event, 'tab-logs')">📋 Logs</button>
    </div>
    
    <div id="tab-whatsapp" class="tab-content active">
      <div id="status">Carregando...</div>
      <div id="actionMessage" style="color: var(--cor-ciano); margin: 0.5rem 0; font-weight:600;"></div>
      <div id="qr"></div>
      <div>
        <button class="primary" id="requestQr" style="display:none">Solicitar QR Code</button>
        <button id="cancelQr" style="display:none">Cancelar QR Code</button>
        <button class="danger" id="disconnect" style="display:none">Desconectar WhatsApp</button>
        <button id="resetSession" style="display:none; background: rgba(234, 88, 12, 0.25); color: #fdba74; border: 1px solid rgba(234, 88, 12, 0.5);">Resetar Conexão / Limpar Cache</button>
      </div>
    </div>

    <!-- Aba de Gestão de Eventos -->
    <div id="tab-eventos" class="tab-content">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 14px;">
        <div>
          <h3 class="section-title-tab" style="margin-bottom: 4px; font-size: 1.4rem;">Gerenciador Completo de Eventos</h3>
          <p style="color: var(--cor-texto-mutado); font-size: 0.88rem; margin: 0;">Cadastre eventos com fotos, crie formulários com perguntas automáticas, mande para a planilha ou direcione direto para o WhatsApp sem complicações.</p>
        </div>
        <button type="button" class="btn-destaque-novo-evento" id="btnToggleEditorEvento" onclick="toggleEditorNovoEvento()">
          <span>✨</span> <span id="btnToggleEditorTexto">+ Criar Novo Evento</span>
        </button>
      </div>

      <!-- Métricas Gerais de Eventos -->
      <div class="eventos-dashboard-bar">
        <div class="stat-card-evento">
          <div class="stat-card-evento-icon">📅</div>
          <div>
            <div class="stat-card-evento-num" id="statTotalEventosPainel">0</div>
            <div class="stat-card-evento-label">Eventos Personalizados</div>
          </div>
        </div>
        <div class="stat-card-evento">
          <div class="stat-card-evento-icon" style="background: rgba(34, 197, 94, 0.12); color: #4ade80; border-color: rgba(34, 197, 94, 0.25);">👥</div>
          <div>
            <div class="stat-card-evento-num" id="statTotalInscritosGeral" style="color: #4ade80;">0</div>
            <div class="stat-card-evento-label">Total de Inscrições</div>
          </div>
        </div>
        <div class="stat-card-evento">
          <div class="stat-card-evento-icon" style="background: rgba(168, 85, 247, 0.12); color: #c084fc; border-color: rgba(168, 85, 247, 0.25);">📝</div>
          <div>
            <div class="stat-card-evento-num" id="statEventosComFormulario" style="color: #c084fc;">0</div>
            <div class="stat-card-evento-label">Com Inscrição no Site</div>
          </div>
        </div>
        <div class="stat-card-evento">
          <div class="stat-card-evento-icon" style="background: rgba(37, 211, 102, 0.12); color: #25d366; border-color: rgba(37, 211, 102, 0.25);">💬</div>
          <div>
            <div class="stat-card-evento-num" id="statEventosWhatsapp" style="color: #25d366;">0</div>
            <div class="stat-card-evento-label">Direcionando ao Whats</div>
          </div>
        </div>
      </div>

      <!-- Box Editor / Criador de Novo Evento (Abre/Fecha) -->
      <div id="boxEditorNovoEvento" class="box-editor-evento" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 12px; margin-bottom: 1.5rem;">
          <div>
            <h4 style="font-size: 1.25rem; color: #fff; margin: 0 0 4px;" id="tituloEditorEvento">✨ Cadastrar Novo Evento</h4>
            <p style="color: var(--cor-texto-mutado); font-size: 0.85rem; margin: 0;">Preencha os dados abaixo e o site gera a página e a rota automaticamente.</p>
          </div>
          <button type="button" onclick="toggleEditorNovoEvento(false)" style="background: rgba(255, 255, 255, 0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 6px 12px; font-size: 0.82rem; cursor: pointer;">✕ Fechar</button>
        </div>

        <form id="formNovoEventoPainel" onsubmit="salvarNovoEventoPainel(event)">
          <input type="hidden" id="editorEventoId" value="" />

          <!-- 1. Dados Básicos -->
          <div class="form-group">
            <label class="form-label" for="editorEventoTitulo">Nome / Título do Evento <span class="req">*</span></label>
            <input type="text" id="editorEventoTitulo" class="form-input" placeholder="Ex: Conferência de Mulheres 2026, Retiro de Jovens..." required />
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 1.2rem;">
            <div>
              <label class="form-label" for="editorEventoData">Data do Evento</label>
              <input type="text" id="editorEventoData" class="form-input" placeholder="Ex: 15/11/2026 ou Sábado, 15 de Nov" />
            </div>
            <div>
              <label class="form-label" for="editorEventoHorario">Horário de Início</label>
              <input type="text" id="editorEventoHorario" class="form-input" placeholder="Ex: 19:30" />
            </div>
            <div>
              <label class="form-label" for="editorEventoLocal">Local</label>
              <input type="text" id="editorEventoLocal" class="form-input" value="Comunidade Cristã Curados" placeholder="Ex: Templo Principal, Sítio..." />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="editorEventoDescricao">Descrição / Detalhes do Evento</label>
            <textarea id="editorEventoDescricao" class="form-input" rows="3" placeholder="Escreva sobre o evento, convidados, versículo tema ou orientações gerais..."></textarea>
          </div>

          <!-- 2. Fotos e Banners (PC e Celular) -->
          <div class="form-group" style="margin-top: 1.5rem;">
            <label class="form-label" style="font-size: 0.95rem; margin-bottom: 4px;">Fotos / Banners do Evento (PC & Celular)</label>
            <p style="color: var(--cor-texto-mutado); font-size: 0.8rem; margin-bottom: 12px;">Faça upload de duas versões do banner para garantir visual perfeito tanto no computador quanto no celular!</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
              <!-- Banner Desktop / PC -->
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(0, 188, 212, 0.25); border-radius: 14px; padding: 1.1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="color: #fff; font-size: 0.88rem;">🖥️ Banner para PC / Computador</strong>
                  <span style="font-size: 0.72rem; color: var(--cor-ciano); font-weight: 600;">Horizontal (ex: 1200x500)</span>
                </div>
                <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                  <div class="banner-preview-box" id="bannerPreviewBox" onclick="document.getElementById('editorEventoBannerFile').click()" style="width: 120px; height: 75px; flex-shrink: 0;">
                    <div id="bannerPlaceholderText" style="text-align: center; color: var(--cor-texto-mutado); font-size: 0.72rem;">
                      <span style="font-size: 1.3rem; display: block;">📸</span>
                      Subir PC
                    </div>
                    <img id="bannerPreviewImg" class="banner-preview-img" alt="Prévia PC" style="display: none; width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                  <div style="flex: 1;">
                    <input type="file" id="editorEventoBannerFile" accept="image/*" style="display: none;" onchange="handleBannerUpload(this, 'desktop')" />
                    <button type="button" onclick="document.getElementById('editorEventoBannerFile').click()" style="background: rgba(0, 188, 212, 0.15); color: var(--cor-ciano); border: 1px solid rgba(0, 188, 212, 0.35); padding: 7px 12px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; margin-bottom: 6px;">
                      📁 Escolher Imagem PC
                    </button>
                    <div style="font-size: 0.74rem; color: var(--cor-texto-mutado);">Ou URL direta:</div>
                  </div>
                </div>
                <input type="text" id="editorEventoBannerUrl" class="form-input" placeholder="https://exemplo.com/pc.jpg ou /images/..." oninput="atualizarBannerUrlPreview(this.value, 'desktop')" style="font-size: 0.82rem; padding: 7px 10px;" />
              </div>

              <!-- Banner Mobile / Celular -->
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 14px; padding: 1.1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="color: #fff; font-size: 0.88rem;">📱 Banner para Celular / Mobile</strong>
                  <span style="font-size: 0.72rem; color: #c084fc; font-weight: 600;">Vertical ou Quadrado</span>
                </div>
                <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                  <div class="banner-preview-box" id="bannerMobilePreviewBox" onclick="document.getElementById('editorEventoBannerMobileFile').click()" style="width: 75px; height: 75px; flex-shrink: 0;">
                    <div id="bannerMobilePlaceholderText" style="text-align: center; color: var(--cor-texto-mutado); font-size: 0.72rem;">
                      <span style="font-size: 1.3rem; display: block;">📱</span>
                      Subir Celular
                    </div>
                    <img id="bannerMobilePreviewImg" class="banner-preview-img" alt="Prévia Mobile" style="display: none; width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                  <div style="flex: 1;">
                    <input type="file" id="editorEventoBannerMobileFile" accept="image/*" style="display: none;" onchange="handleBannerUpload(this, 'mobile')" />
                    <button type="button" onclick="document.getElementById('editorEventoBannerMobileFile').click()" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); padding: 7px 12px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; margin-bottom: 6px;">
                      📁 Escolher Imagem Celular
                    </button>
                    <div style="font-size: 0.74rem; color: var(--cor-texto-mutado);">Ou URL direta:</div>
                  </div>
                </div>
                <input type="text" id="editorEventoBannerMobileUrl" class="form-input" placeholder="https://exemplo.com/celular.jpg ou /images/..." oninput="atualizarBannerUrlPreview(this.value, 'mobile')" style="font-size: 0.82rem; padding: 7px 10px;" />
              </div>
            </div>
          </div>

          <!-- 3. Modo de Inscrição / Participação -->
          <div class="form-group" style="margin-top: 1.8rem;">
            <label class="form-label" style="font-size: 0.95rem;">Modo de Participação / Inscrição <span class="req">*</span></label>
            <div class="modo-cards-grid">
              <div class="modo-card selected" id="modoCardFormulario" onclick="selecionarModoInscricao('formulario')">
                <div class="modo-card-title">📝 Inscrição no Site</div>
                <div class="modo-card-desc">Cria uma página oficial com ficha de inscrição e envia os dados para a sua planilha Google.</div>
              </div>
              <div class="modo-card" id="modoCardWhatsapp" onclick="selecionarModoInscricao('whatsapp')">
                <div class="modo-card-title">💬 Direto pro WhatsApp</div>
                <div class="modo-card-desc">Sem formulário. A pessoa vê as fotos e descrição e clica num botão que abre o WhatsApp.</div>
              </div>
              <div class="modo-card" id="modoCardExterno" onclick="selecionarModoInscricao('externo')">
                <div class="modo-card-title">🔗 Inscrição Externa</div>
                <div class="modo-card-desc">O botão direciona para link de Google Forms, Sympla ou outro site externo.</div>
              </div>
            </div>
          </div>

          <!-- Seção Condicional 1: Inscrição no Site (Planilha + Perguntas) -->
          <div id="secaoModoFormulario" style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(0, 188, 212, 0.2); border-radius: 14px; padding: 1.4rem; margin-bottom: 1.5rem;">
            <div class="form-group">
              <label class="form-label" for="editorEventoPlanilhaUrl">URL da Planilha / Web App Google (Google Apps Script)</label>
              <input type="text" id="editorEventoPlanilhaUrl" class="form-input" placeholder="https://script.google.com/macros/s/.../exec (opcional - envia automático se preenchido)" />
              <small style="color: var(--cor-texto-mutado); display: block; margin-top: 4px;">Se preenchida, cada nova inscrição salva no site é enviada instantaneamente para a sua planilha do Google!</small>
            </div>

            <div style="margin-top: 1.4rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div>
                  <strong style="color: #fff; font-size: 0.92rem;">Perguntas Personalizadas da Ficha</strong>
                  <div style="color: var(--cor-texto-mutado); font-size: 0.78rem;">Nome, Telefone e E-mail já estão inclusos por padrão. Adicione quantas perguntas extras quiser!</div>
                </div>
                <button type="button" onclick="adicionarPerguntaBuilder()" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.35); padding: 6px 14px; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
                  + Adicionar Pergunta
                </button>
              </div>

              <div id="containerPerguntasBuilder"></div>
            </div>
          </div>

          <!-- Seção Condicional 2: WhatsApp -->
          <div id="secaoModoWhatsapp" style="display: none; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(37, 211, 102, 0.2); border-radius: 14px; padding: 1.4rem; margin-bottom: 1.5rem;">
            <div style="display: grid; grid-template-columns: 220px 1fr; gap: 14px;">
              <div>
                <label class="form-label" for="editorEventoWhatsContato">WhatsApp de Atendimento</label>
                <input type="tel" id="editorEventoWhatsContato" class="form-input" value="11942685501" placeholder="(11) 94268-5501" />
              </div>
              <div>
                <label class="form-label" for="editorEventoWhatsMensagem">Mensagem Pré-definida (opcional)</label>
                <input type="text" id="editorEventoWhatsMensagem" class="form-input" placeholder="Ex: Olá, gostaria de saber mais sobre o evento..." />
              </div>
            </div>
          </div>

          <!-- Seção Condicional 3: Link Externo -->
          <div id="secaoModoExterno" style="display: none; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 14px; padding: 1.4rem; margin-bottom: 1.5rem;">
            <div class="form-group">
              <label class="form-label" for="editorEventoLinkExterno">Link do Formulário Externo</label>
              <input type="text" id="editorEventoLinkExterno" class="form-input" placeholder="https://forms.gle/... ou https://sympla.com.br/..." />
            </div>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end; align-items: center; margin-top: 1.5rem;">
            <button type="button" onclick="toggleEditorNovoEvento(false)" style="background: rgba(255, 255, 255, 0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); padding: 11px 20px; border-radius: 10px; font-weight: 600; cursor: pointer;">Cancelar</button>
            <button type="submit" id="btnSalvarEventoSubmit" class="primary" style="padding: 11px 26px; font-size: 0.95rem; font-weight: 800; border-radius: 10px; width: auto;">
              🚀 Salvar e Publicar Evento
            </button>
          </div>
        </form>
      </div>

      <!-- Grid de Eventos Cadastrados no Painel -->
      <div style="margin-bottom: 2.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h4 style="font-size: 1.15rem; color: #fff; margin: 0;">📋 Eventos Criados no Sistema</h4>
          <button onclick="fetchEventosPainel()" style="background: rgba(255, 255, 255, 0.08); color: #fff; padding: 6px 12px; font-size: 0.82rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); cursor: pointer;">🔄 Atualizar Eventos</button>
        </div>
        <div id="gridEventosPainel" class="grid-eventos-dinamicos">
          <div style="color: var(--cor-texto-mutado); font-size: 0.88rem; padding: 1.5rem; background: var(--cor-card-alt); border-radius: 14px; border: 1px solid var(--cor-borda); grid-column: 1 / -1;">
            Carregando eventos...
          </div>
        </div>
      </div>

      <!-- Seção Histórica: Eventos Especiais & Anamneses Pré-existentes (Colapsável) -->
      <div style="margin-top: 3rem; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; flex-wrap: wrap; gap: 10px;">
          <div>
            <h4 style="font-size: 1.2rem; color: #fff; margin: 0 0 4px; font-weight: 800;">🏛️ Eventos Fixos & Anamneses</h4>
            <p style="color: var(--cor-texto-mutado); font-size: 0.85rem; margin: 0;">Consulte as inscrições e relatórios dos eventos históricos e fichas clínicas.</p>
          </div>
        </div>


      ${!isEventoExpiradoData('2026-10-31') ? `
      <!-- Card do Evento Saúde da Mulher — Palestra + Pilates -->
      <div class="evento-card-item" data-event-date="2026-10-31" style="margin-top: 2rem; border-color: rgba(225, 29, 72, 0.45); background: linear-gradient(135deg, rgba(225, 29, 72, 0.12), rgba(219, 39, 119, 0.06));">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: inline-block; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; background: rgba(225, 29, 72, 0.2); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.4); padding: 4px 10px; border-radius: 999px; margin-bottom: 8px;">
              🎀 Outubro Rosa • Saúde da Mulher
            </div>
            <h4 style="font-size: 1.35rem; color: #fff; margin: 0 0 6px;">Saúde da Mulher — Palestra + Pilates (Anamnese)</h4>
            <p style="color: var(--cor-texto-mutado); font-size: 0.88rem; margin: 0;">
              🗓️ <strong>31/10/2026 às 15:00</strong> &nbsp;•&nbsp; 📍 <strong>Comunidade Cristã Curados (Templo Principal)</strong> &nbsp;•&nbsp; <em>Ficha de Anamnese Obrigatória</em>
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <button type="button" class="btn-gaveta-toggle" id="btnToggleSaudeMulher" onclick="toggleGavetaEvento('saude_mulher')" title="Recolher ou expandir inscrições (engavetar)">
              <span class="gaveta-toggle-text">Recolher</span>
              <span class="gaveta-arrow" id="arrow-saude_mulher">▲</span>
            </button>
            <button onclick="sincronizarComPlanilhaSaudeMulher()" id="btnSyncPlanilhaSaudeMulher" style="background: rgba(34, 197, 94, 0.15); color: #86efac; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(34, 197, 94, 0.3); cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Puxar todas as inscrições atualizadas do Google Sheets">
              🔄 Puxar da Planilha
            </button>
            <button onclick="window.open('/saude-da-mulher/fichas', '_blank')" style="background: linear-gradient(135deg, #be185d, #9d174d); color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(190, 24, 93, 0.35);" title="Ver fichas individuais organizadas para a Professora de Pilates e Líderes">
              📑 Fichas da Professora & Líderes
            </button>
            <button onclick="window.open('/saude-da-mulher', '_blank')" style="background: rgba(255, 255, 255, 0.08); color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Ver formulário e anamnese pública">
              🔗 Abrir Formulário
            </button>
            <button onclick="window.open('https://docs.google.com/spreadsheets/d/1UzaEVYBZe7NDosUtRS5aT-QJkNFoFu5PJCjicnE5_lg/edit?usp=sharing', '_blank')" style="background: rgba(34, 197, 94, 0.15); color: #86efac; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(34, 197, 94, 0.3); cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Abrir planilha no Google Sheets">
              📊 Planilha Google
            </button>
            <button onclick="window.open('/saude-mulher/api/relatorio-pdf', '_blank')" style="background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; padding: 10px 18px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35);">
              📄 Exportar Lista (PDF)
            </button>
            <button onclick="fetchSaudeMulherInscricoes()" style="background: rgba(255, 255, 255, 0.08); color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer;">
              🔄 Atualizar
            </button>
          </div>
        </div>

        <div class="evento-gaveta-body" id="gaveta-saude_mulher">
          <div class="evento-metric-grid" id="saudeMulherMetrics">
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="saudeMulherTotal" style="color: #fda4af;">-</div>
              <div class="evento-metric-lbl">Total de Alunas</div>
            </div>
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="saudeMulherComCondicao" style="color: #fb7185;">-</div>
              <div class="evento-metric-lbl">Condição de Saúde</div>
            </div>
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="saudeMulherComLesao" style="color: #f43f5e;">-</div>
              <div class="evento-metric-lbl">Dores / Lesões</div>
            </div>
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="saudeMulherGestantes" style="color: #f472b6;">-</div>
              <div class="evento-metric-lbl">Gestantes</div>
            </div>
          </div>

          <!-- Barra de Filtros e Busca de Saúde da Mulher -->
          <div class="evento-toolbar" style="margin-top: 1.2rem;">
            <input type="text" id="saudeMulherSearchInput" class="evento-search-input" placeholder="🔍 Filtrar por aluna, telefone, condição de saúde, lesão ou cirurgia..." oninput="filtrarSaudeMulherInscricoes()" />
          </div>

          <!-- Tabela de Inscritas com Respostas de Anamnese -->
          <div style="background: var(--cor-card-alt); border: 1px solid var(--cor-borda); border-radius: 16px; overflow-x: auto; margin-bottom: 0.5rem;">
            <table class="evento-table">
              <thead>
                <tr>
                  <th style="width: 45px; text-align: center;">Nº</th>
                  <th>Nome da Aluna</th>
                  <th style="width: 60px; text-align: center;">Idade</th>
                  <th>Telefone / WhatsApp</th>
                  <th>Condições de Saúde / Medicamentos</th>
                  <th>Cirurgia</th>
                  <th>Lesões / Dores</th>
                  <th>Limitações</th>
                  <th style="width: 75px; text-align: center;">Gestante</th>
                  <th>Atividade Física</th>
                  <th>Observações</th>
                  <th style="width: 100px; text-align: center;">Ações</th>
                </tr>
              </thead>
              <tbody id="saudeMulherTbodyInscritos">
                <tr>
                  <td colspan="12" style="text-align: center; color: var(--cor-texto-mutado); padding: 2rem;">Carregando alunas inscritas...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ` : ''}

      ${!isEventoExpiradoData('2026-11-15') ? `
      <!-- Card do Evento Treinamento de Intercessão -->
      <div class="evento-card-item" data-event-date="2026-11-15" style="margin-top: 2rem; border-color: rgba(249, 115, 22, 0.45); background: linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(168, 85, 247, 0.08));">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: inline-block; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; background: rgba(249, 115, 22, 0.2); color: #fdba74; border: 1px solid rgba(249, 115, 22, 0.4); padding: 4px 10px; border-radius: 999px; margin-bottom: 8px;">
              🙏 Ministério de Intercessão
            </div>
            <h4 style="font-size: 1.35rem; color: #fff; margin: 0 0 6px;">Treinamento de Intercessão</h4>
            <p style="color: var(--cor-texto-mutado); font-size: 0.88rem; margin: 0;">
              🗓️ <strong>15/11/2026 às 16:00 (Todos os Domingos)</strong> &nbsp;•&nbsp; 📍 <strong>Comunidade Cristã Curados (Templo Principal)</strong> &nbsp;•&nbsp; <em>"e serás chamado reparador de brechas e restaurador de veredas"</em>
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <button type="button" class="btn-gaveta-toggle" id="btnToggleIntercessao" onclick="toggleGavetaEvento('intercessao')" title="Recolher ou expandir inscrições (engavetar)">
              <span class="gaveta-toggle-text">Recolher</span>
              <span class="gaveta-arrow" id="arrow-intercessao">▲</span>
            </button>
            <button onclick="sincronizarComPlanilhaIntercessao()" id="btnSyncPlanilhaIntercessao" style="background: rgba(34, 197, 94, 0.15); color: #86efac; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(34, 197, 94, 0.3); cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Puxar todas as inscrições atualizadas do Google Sheets">
              🔄 Puxar da Planilha
            </button>
            <button onclick="window.open('/intercessao/fichas', '_blank')" style="background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);" title="Ver fichas individuais organizadas para os Líderes de Intercessão">
              📑 Fichas & Líderes
            </button>
            <button onclick="window.open('/treinamento-de-intercessao', '_blank')" style="background: rgba(255, 255, 255, 0.08); color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer; display: flex; align-items: center; gap: 6px;" title="Ver formulário público de inscrição">
              🔗 Abrir Formulário
            </button>
            <button onclick="window.open('/intercessao/api/relatorio-pdf', '_blank')" style="background: linear-gradient(135deg, #a855f7, #9333ea); color: #fff; padding: 10px 18px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(168, 85, 247, 0.35);">
              📄 Exportar Lista (PDF)
            </button>
            <button onclick="fetchIntercessaoInscricoes()" style="background: rgba(255, 255, 255, 0.08); color: #fff; padding: 10px 16px; border-radius: 10px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer;">
              🔄 Atualizar
            </button>
          </div>
        </div>

        <div class="evento-gaveta-body" id="gaveta-intercessao">
          <div class="evento-metric-grid" id="intercessaoMetrics">
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="intercessaoTotal" style="color: #fdba74;">-</div>
              <div class="evento-metric-lbl">Total de Inscritos</div>
            </div>
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="intercessaoComExperiencia" style="color: #d8b4fe;">-</div>
              <div class="evento-metric-lbl">Já Fez Curso / Atuou</div>
            </div>
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="intercessaoSemExperiencia" style="color: #93c5fd;">-</div>
              <div class="evento-metric-lbl">Primeira Vez</div>
            </div>
            <div class="evento-metric-box">
              <div class="evento-metric-val" id="intercessaoZapConfirmados" style="color: #4ade80;">-</div>
              <div class="evento-metric-lbl">Confirmação WhatsApp</div>
            </div>
          </div>

          <!-- Barra de Filtros e Busca de Intercessão -->
          <div class="evento-toolbar" style="margin-top: 1.2rem;">
            <input type="text" id="intercessaoSearchInput" class="evento-search-input" placeholder="🔍 Filtrar por participante, telefone, e-mail ou experiência..." oninput="filtrarIntercessaoInscricoes()" />
          </div>

          <!-- Tabela de Inscritos de Intercessão -->
          <div style="background: var(--cor-card-alt); border: 1px solid var(--cor-borda); border-radius: 16px; overflow-x: auto; margin-bottom: 0.5rem;">
            <table class="evento-table">
              <thead>
                <tr>
                  <th style="width: 50px; text-align: center;">Nº</th>
                  <th>Nome do Participante</th>
                  <th>Telefone / WhatsApp</th>
                  <th>E-mail</th>
                  <th style="width: 140px; text-align: center;">Já participou / curso?</th>
                  <th>Detalhes da Experiência</th>
                  <th style="width: 130px; text-align: center;">Data Inscrição</th>
                  <th style="width: 100px; text-align: center;">Ações</th>
                </tr>
              </thead>
              <tbody id="intercessaoTbodyInscritos">
                <tr>
                  <td colspan="8" style="text-align: center; color: var(--cor-texto-mutado); padding: 2rem;">Carregando participantes inscritos...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ` : ''}
      </div>
    </div>

    <div id="tab-admin" class="tab-content">
      <h3 class="section-title-tab">Usuários do Sistema</h3>
      <ul id="userList"></ul>
      <hr>
      <h4 style="font-size: 1.1rem; color: #ffffff; margin-bottom: 0.75rem;">Novo Usuário</h4>
      <div id="adminMessage" class="message-box" style="display:none;"></div>
      <form id="addUserForm">
        <input name="username" placeholder="Nome de usuário" required />
        <select name="role">
          <option value="user">Usuário Líder</option>
          <option value="admin">Administrador</option>
        </select>
        <button type="submit" class="primary">Adicionar Usuário</button>
      </form>
    </div>

    <div id="tab-lideres" class="tab-content">
      <div class="lideres-grid-layout">
        <!-- Coluna Esquerda: Lista de Usuários e Filtros -->
        <div class="lideres-col-lista">
          <div class="lideres-lista-header">
            <div>
              <h3 class="section-title-tab" style="margin: 0 0 4px 0;">Gestão de Usuários & Cargos</h3>
              <span id="lideresContador" class="lideres-contador">Carregando usuários...</span>
            </div>
            <button type="button" class="btn-novo-usuario" id="btnNovoLiderTopo">
              ➕ Novo Usuário
            </button>
          </div>
          <div class="filtros-lideres">
            <input id="filtroLiderNome" placeholder="🔍 Buscar por nome, cargo ou ministério" />
            <input id="filtroLiderTelefone" placeholder="📱 Buscar por telefone" inputmode="numeric" autocomplete="off" />
          </div>
          <ul id="liderList" class="lider-cards-list"></ul>
        </div>

        <!-- Coluna Direita: Formulário Fixo / Sticky ao Lado -->
        <div class="lideres-col-form" id="liderFormContainer">
          <div class="form-sticky-card" id="liderFormCard">
            <div class="form-header-flex">
              <h4 id="liderFormTitle" style="font-size: 1.08rem; color: #ffffff; margin: 0;">Novo Usuário / Cargo</h4>
              <span id="badgeModoEdicao" class="badge-modo-edicao" style="display:none;">✏️ Editando</span>
            </div>
            <div id="lideresMessage" class="message-box" style="display:none;"></div>
            <form id="addLiderForm">
              <input name="nome" placeholder="Nome completo" required />
              <input id="liderTelefone" name="telefone" placeholder="Ex: +55 (11) 94308-6727" inputmode="numeric" maxlength="19" autocomplete="off" required />
              <input id="liderDataNascimento" name="dataNascimento" placeholder="Data de Nascimento (Ex: 15/04 ou 15/04/1990)" maxlength="10" autocomplete="off" />
              <div class="deptos-container" style="margin-bottom: 14px;">
                <span class="cargos-title" style="display:block; font-size: 0.85rem; color: #a1a1aa; margin-bottom: 6px;">Departamentos / Ministérios:</span>
                <div class="deptos-checkboxes" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; max-height: 160px; overflow-y: auto; padding: 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px;">
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Rede Kids" /> <img src="/images/icon-kids.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Rede Kids</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Rede Ruach" /> <img src="/images/icon-ruach.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Rede Ruach</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Rede de Casais" /> <img src="/images/icon-casais.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Rede de Casais</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Rede de Homens" /> <img src="/images/icon-homens.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Rede de Homens</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Rede de Mulheres" /> <img src="/images/icon-mulheres.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Rede de Mulheres</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Epifania" /> <img src="/images/icon-epifania.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Epifania</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Departamento de Artes" /> <img src="/images/icon-artes.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Departamento de Artes</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Evangelismo" /> <img src="/images/icon-evangelismo.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Evangelismo</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Intercessão" /> <img src="/images/icon-intercessao.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Intercessão</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Projeto Social Seeds" /> <img src="/images/icon-seeds.png" alt="" style="width: 16px; height: 16px; object-fit: contain;" /> Projeto Social Seeds</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Diaconia" /> Diaconia</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Relacionamentos" /> Relacionamentos</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Eventos Externos" /> Eventos Externos</label>
                  <label style="font-size: 0.85rem; display: flex; align-items: center; gap: 6px; cursor: pointer; color: #e4e4e7;"><input type="checkbox" name="departamentos" value="Outros" /> Outros</label>
                </div>
              </div>
              <div class="cargos-container" style="margin-top: 0;">
                <span class="cargos-title">Cargos / Permissões Ministeriais:</span>
                <div class="cargos-checkboxes">
                  <label><input type="checkbox" name="cargos" value="lider" checked /> Líder</label>
                  <label><input type="checkbox" name="cargos" value="pastor" /> Pastor</label>
                  <label><input type="checkbox" name="cargos" value="diretor" /> Diretor</label>
                  <label><input type="checkbox" name="cargos" value="membro" /> Membro</label>
                </div>
              </div>
              <div style="display: flex; gap: 10px; margin-top: 14px;">
                <button type="submit" id="liderSubmitBtn" class="primary" style="flex: 1;">Adicionar</button>
                <button type="button" id="cancelarEdicaoLider" style="display:none;">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>

    <div id="tab-logs" class="tab-content">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 class="section-title-tab" style="margin:0;">Logs do Sistema</h3>
        <button class="danger" id="clearLogsBtn" style="padding: 6px 14px; font-size: 0.82rem; width: auto;">Limpar Logs</button>
      </div>
      <pre id="logsContainer">Carregando logs...</pre>
    </div>
  </div>

  <!-- Modal Gaveta de Inscritos de Evento Dinâmico -->
  <div id="modalInscritosEventoDinamico" class="modal-overlay" onclick="fecharModalInscritosEvento(event)">
    <div class="modal-container" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3 id="modalInscritosTitulo" style="color: #fff; font-size: 1.3rem; margin: 0 0 4px;">Inscritos do Evento</h3>
          <span id="modalInscritosSubtitulo" style="color: var(--cor-texto-mutado); font-size: 0.85rem;">Carregando participantes...</span>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="btnExportarPdfModal" style="background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; cursor: pointer;">
            📄 Imprimir / PDF
          </button>
          <button type="button" onclick="fecharModalInscritosEvento()" style="background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 14px; font-size: 0.9rem; cursor: pointer;">
            ✕ Fechar
          </button>
        </div>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 1.2rem;">
          <input type="text" id="modalBuscaInscritosInput" class="evento-search-input" placeholder="🔍 Filtrar por nome, telefone ou respostas..." oninput="filtrarInscritosEventoDinamico()" />
        </div>
        <div style="background: var(--cor-card); border: 1px solid var(--cor-borda); border-radius: 14px; overflow-x: auto;">
          <table class="evento-table">
            <thead id="modalInscritosTableThead">
              <tr>
                <th style="width: 40px; text-align: center;">Nº</th>
                <th>Nome</th>
                <th>Telefone / WhatsApp</th>
                <th>E-mail</th>
                <th style="width: 90px; text-align: center;">Ações</th>
              </tr>
            </thead>
            <tbody id="modalInscritosTableTbody">
              <tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--cor-texto-mutado);">Carregando participantes...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <script>
    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================
    function mostrarToast(mensagem, tipo = 'sucesso') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const t = document.createElement('div');
      t.className = 'toast ' + tipo;
      const icon = tipo === 'sucesso' ? '✅' : (tipo === 'erro' ? '❌' : 'ℹ️');
      t.innerHTML = '<span>' + icon + '</span> <span>' + mensagem + '</span>';
      container.appendChild(t);
      setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(10px)';
        setTimeout(() => t.remove(), 300);
      }, 3500);
    }

    // ==========================================
    // GERENCIADOR DINÂMICO DE EVENTOS
    // ==========================================
    let modoInscricaoSelecionado = 'formulario';
    let perguntasBuilderLista = [];
    let eventosPainelCache = [];
    let modalEventoAtualId = null;
    let modalInscricoesCache = [];
    let modalEventoAtualObj = null;

    function toggleEditorNovoEvento(forcarAberto) {
      const box = document.getElementById('boxEditorNovoEvento');
      const btnTexto = document.getElementById('btnToggleEditorTexto');
      if (!box) return;
      const aberto = forcarAberto !== undefined ? forcarAberto : (box.style.display === 'none' || !box.style.display);
      box.style.display = aberto ? 'block' : 'none';
      if (btnTexto) btnTexto.textContent = aberto ? '✕ Fechar Criador' : '+ Criar Novo Evento';
      if (aberto) {
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (perguntasBuilderLista.length === 0) {
          renderPerguntasBuilder();
        }
      }
    }

    function selecionarModoInscricao(modo) {
      modoInscricaoSelecionado = modo;
      document.getElementById('modoCardFormulario')?.classList.toggle('selected', modo === 'formulario');
      document.getElementById('modoCardWhatsapp')?.classList.toggle('selected', modo === 'whatsapp');
      document.getElementById('modoCardExterno')?.classList.toggle('selected', modo === 'externo');

      const sForm = document.getElementById('secaoModoFormulario');
      const sWhats = document.getElementById('secaoModoWhatsapp');
      const sExt = document.getElementById('secaoModoExterno');

      if (sForm) sForm.style.display = modo === 'formulario' ? 'block' : 'none';
      if (sWhats) sWhats.style.display = modo === 'whatsapp' ? 'block' : 'none';
      if (sExt) sExt.style.display = modo === 'externo' ? 'block' : 'none';
    }

    function atualizarBannerUrlPreview(url, tipo = 'desktop') {
      const imgId = tipo === 'mobile' ? 'bannerMobilePreviewImg' : 'bannerPreviewImg';
      const phId = tipo === 'mobile' ? 'bannerMobilePlaceholderText' : 'bannerPlaceholderText';
      const img = document.getElementById(imgId);
      const placeholder = document.getElementById(phId);
      if (!img || !placeholder) return;
      if (url && url.trim()) {
        img.src = url.trim();
        img.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        img.style.display = 'none';
        placeholder.style.display = 'block';
      }
    }

    async function handleBannerUpload(input, tipo = 'desktop') {
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      const urlInputId = tipo === 'mobile' ? 'editorEventoBannerMobileUrl' : 'editorEventoBannerUrl';
      const reader = new FileReader();
      reader.onload = async function(e) {
        const base64 = e.target.result;
        atualizarBannerUrlPreview(base64, tipo);

        try {
          const res = await fetch('/secretaria/api/eventos-painel/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagemBase64: base64, nomeArquivo: file.name })
          });
          const data = await res.json();
          if (res.ok && data.ok && data.url) {
            document.getElementById(urlInputId).value = data.url;
            mostrarToast((tipo === 'mobile' ? 'Banner Celular' : 'Banner PC') + ' enviado com sucesso!');
          }
        } catch (err) {
          console.warn('Erro ao fazer upload para servidor, usando data-url:', err);
          document.getElementById(urlInputId).value = base64;
        }
      };
      reader.readAsDataURL(file);
    }

    function renderPerguntasBuilder() {
      const container = document.getElementById('containerPerguntasBuilder');
      if (!container) return;

      if (perguntasBuilderLista.length === 0) {
        container.innerHTML = '<div style="color: var(--cor-texto-mutado); font-size: 0.82rem; font-style: italic; padding: 8px 0;">Nenhuma pergunta personalizada adicionada ainda. Clique em "+ Adicionar Pergunta" acima para criar campos extras (ex: opções personalizadas, WhatsApp adicional, Sim/Não, texto, restrições).</div>';
        return;
      }

      container.innerHTML = perguntasBuilderLista.map((p, idx) => {
        let campoExtraHtml = '';

        if (p.tipo === 'escolha') {
          campoExtraHtml = '<div style="grid-column: 1 / -1; margin-top: 4px; background: rgba(0, 188, 212, 0.08); border: 1px dashed rgba(0, 188, 212, 0.35); border-radius: 10px; padding: 10px 12px;">' +
            '<label style="font-size:0.75rem; color:var(--cor-ciano); font-weight:700; display:block; margin-bottom:4px;">🎯 Opções de Resposta (digite as opções separadas por vírgula):</label>' +
            '<input type="text" class="form-input" style="padding:7px 10px; font-size:0.85rem;" placeholder="Ex: Opção 1, Opção 2, Opção 3 (ou: Manhã, Tarde, Noite)" value="' + (p.opcoes || '').replace(/"/g, '&quot;') + '" oninput="atualizarOpcoesPerguntaBuilder(' + idx + ', this.value)" />' +
            '<small style="color:#94a3b8; font-size:0.73rem; display:block; margin-top:3px;">O participante verá um menu para escolher uma dessas opções.</small>' +
          '</div>';
        } else if (p.tipo === 'sim_nao') {
          campoExtraHtml = '<div style="grid-column: 1 / -1; margin-top: 4px;">' +
            '<label style="font-size:0.73rem; color:#a1a1aa; display:block; margin-bottom:2px;">Rótulo da caixa de detalhes (quando marcar Sim):</label>' +
            '<input type="text" class="form-input" style="padding:6px 10px; font-size:0.82rem;" placeholder="Ex: Qual cirurgia, dor ou restrição? (opcional)" value="' + (p.detalhePlaceholder || '').replace(/"/g, '&quot;') + '" oninput="atualizarDetalhePlaceholderPerguntaBuilder(' + idx + ', this.value)" />' +
          '</div>';
        }

        return '<div class="pergunta-row" style="display:grid; grid-template-columns: 1fr 180px 130px 40px; gap:10px; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px 14px; margin-bottom:10px;">' +
          '<div>' +
            '<label style="font-size:0.75rem; color:#a1a1aa; display:block; margin-bottom:2px;">Pergunta / Rótulo *</label>' +
            '<input type="text" class="form-input" style="padding:8px 10px; font-size:0.85rem;" placeholder="Ex: Tamanho da camiseta, Vai almoçar no local?..." value="' + (p.label || '').replace(/"/g, '&quot;') + '" oninput="atualizarLabelPerguntaBuilder(' + idx + ', this.value)" required />' +
          '</div>' +
          '<div>' +
            '<label style="font-size:0.75rem; color:#a1a1aa; display:block; margin-bottom:2px;">Tipo da Resposta</label>' +
            '<select class="form-input" style="padding:8px 10px; font-size:0.85rem;" onchange="atualizarTipoPerguntaBuilder(' + idx + ', this.value)">' +
              '<option value="texto"' + (p.tipo === 'texto' ? ' selected' : '') + '>Texto Aberto (Curto)</option>' +
              '<option value="escolha"' + (p.tipo === 'escolha' ? ' selected' : '') + '>🎯 Múltipla Escolha (Opções)</option>' +
              '<option value="telefone"' + (p.tipo === 'telefone' ? ' selected' : '') + '>📞 Telefone / WhatsApp</option>' +
              '<option value="sim_nao"' + (p.tipo === 'sim_nao' ? ' selected' : '') + '>Sim / Não (com detalhe)</option>' +
              '<option value="sim_nao_simples"' + (p.tipo === 'sim_nao_simples' ? ' selected' : '') + '>Sim / Não (Simples)</option>' +
              '<option value="texto_longo"' + (p.tipo === 'texto_longo' ? ' selected' : '') + '>Texto Longo (Observações)</option>' +
              '<option value="numero"' + (p.tipo === 'numero' ? ' selected' : '') + '>Número / Idade</option>' +
              '<option value="data"' + (p.tipo === 'data' ? ' selected' : '') + '>Data</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label style="font-size:0.75rem; color:#a1a1aa; display:block; margin-bottom:2px;">Obrigatória?</label>' +
            '<select class="form-input" style="padding:8px 10px; font-size:0.85rem;" onchange="atualizarObrigatorioPerguntaBuilder(' + idx + ', this.value)">' +
              '<option value="1"' + (p.obrigatorio ? ' selected' : '') + '>Sim (Obrigatória)</option>' +
              '<option value="0"' + (!p.obrigatorio ? ' selected' : '') + '>Opcional</option>' +
            '</select>' +
          '</div>' +
          '<div style="text-align: right; padding-top: 14px;">' +
            '<button type="button" onclick="removerPerguntaBuilder(' + idx + ')" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 7px 10px; cursor: pointer;" title="Remover pergunta">✕</button>' +
          '</div>' +
          campoExtraHtml +
        '</div>';
      }).join('');
    }

    function atualizarLabelPerguntaBuilder(idx, valor) {
      if (perguntasBuilderLista && perguntasBuilderLista[idx]) {
        perguntasBuilderLista[idx].label = valor;
      }
    }

    function atualizarTipoPerguntaBuilder(idx, tipo) {
      if (perguntasBuilderLista && perguntasBuilderLista[idx]) {
        perguntasBuilderLista[idx].tipo = tipo;
        if (tipo === 'escolha' && !perguntasBuilderLista[idx].opcoes) {
          perguntasBuilderLista[idx].opcoes = 'Opção 1, Opção 2, Opção 3';
        }
        renderPerguntasBuilder();
      }
    }

    function atualizarOpcoesPerguntaBuilder(idx, valor) {
      if (perguntasBuilderLista && perguntasBuilderLista[idx]) {
        perguntasBuilderLista[idx].opcoes = valor;
      }
    }

    function atualizarDetalhePlaceholderPerguntaBuilder(idx, valor) {
      if (perguntasBuilderLista && perguntasBuilderLista[idx]) {
        perguntasBuilderLista[idx].detalhePlaceholder = valor;
      }
    }

    function atualizarObrigatorioPerguntaBuilder(idx, valor) {
      if (perguntasBuilderLista && perguntasBuilderLista[idx]) {
        perguntasBuilderLista[idx].obrigatorio = (valor === '1');
      }
    }

    function adicionarPerguntaBuilder(dados) {
      perguntasBuilderLista.push(dados || {
        id: 'p_' + Date.now().toString().slice(-6),
        label: '',
        tipo: 'texto',
        opcoes: '',
        obrigatorio: true,
        detalhePlaceholder: 'Por favor, detalhe...'
      });
      renderPerguntasBuilder();
    }

    function removerPerguntaBuilder(idx) {
      perguntasBuilderLista.splice(idx, 1);
      renderPerguntasBuilder();
    }

    async function salvarNovoEventoPainel(e) {
      e.preventDefault();
      const id = document.getElementById('editorEventoId').value;
      const titulo = document.getElementById('editorEventoTitulo').value.trim();
      const dataEvento = document.getElementById('editorEventoData').value.trim();
      const horario = document.getElementById('editorEventoHorario').value.trim();
      const local = document.getElementById('editorEventoLocal').value.trim();
      const descricao = document.getElementById('editorEventoDescricao').value.trim();
      const bannerUrl = document.getElementById('editorEventoBannerUrl').value.trim();
      const bannerMobileUrl = document.getElementById('editorEventoBannerMobileUrl') ? document.getElementById('editorEventoBannerMobileUrl').value.trim() : '';
      const linkPlanilha = document.getElementById('editorEventoPlanilhaUrl').value.trim();
      const whatsappContato = document.getElementById('editorEventoWhatsContato').value.trim();
      const whatsappMensagem = document.getElementById('editorEventoWhatsMensagem').value.trim();
      const linkExterno = document.getElementById('editorEventoLinkExterno').value.trim();

      if (!titulo) {
        mostrarToast('Informe o nome do evento.', 'erro');
        return;
      }

      const btn = document.getElementById('btnSalvarEventoSubmit');
      btn.disabled = true;
      btn.innerHTML = '<span>Gravando evento...</span>';

      const payload = {
        id: id || null,
        titulo,
        dataEvento,
        horario,
        local,
        descricao,
        bannerUrl,
        bannerMobileUrl,
        tipoInscricao: modoInscricaoSelecionado,
        linkPlanilha,
        whatsappContato,
        whatsappMensagem,
        linkExterno,
        perguntas: perguntasBuilderLista,
        ativo: 1
      };

      try {
        const res = await fetch('/secretaria/api/eventos-painel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          mostrarToast('Evento "' + titulo + '" salvo e publicado com sucesso!');
          document.getElementById('formNovoEventoPainel').reset();
          document.getElementById('editorEventoId').value = '';
          perguntasBuilderLista = [];
          atualizarBannerUrlPreview('', 'desktop');
          atualizarBannerUrlPreview('', 'mobile');
          toggleEditorNovoEvento(false);
          await fetchEventosPainel();
        } else {
          mostrarToast(data.message || 'Erro ao salvar evento.', 'erro');
        }
      } catch (err) {
        console.error('Erro ao salvar evento:', err);
        mostrarToast('Erro de conexão ao salvar evento.', 'erro');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '🚀 Salvar e Publicar Evento';
      }
    }

    async function fetchEventosPainel() {
      const grid = document.getElementById('gridEventosPainel');
      if (!grid) return;
      try {
        const res = await fetch('/secretaria/api/eventos-painel');
        if (!res.ok) return;
        const data = await res.json();
        eventosPainelCache = data.eventos || [];
        renderEventosPainel(eventosPainelCache);
        atualizarMetricasGeraisEventos(eventosPainelCache);
      } catch (err) {
        console.error('Erro ao buscar eventos do painel:', err);
        grid.innerHTML = '<div style="color: #fca5a5; padding: 1.5rem; background: var(--cor-card-alt); border-radius: 14px; grid-column: 1 / -1;">Erro ao carregar eventos cadastrados.</div>';
      }
    }

    function atualizarMetricasGeraisEventos(eventos) {
      const total = eventos.length;
      let totalInscritos = 0;
      let comForm = 0;
      let comWhats = 0;

      eventos.forEach(ev => {
        totalInscritos += (ev.totalInscritos || 0);
        if (ev.tipoInscricao === 'formulario') comForm++;
        if (ev.tipoInscricao === 'whatsapp') comWhats++;
      });

      const elTotal = document.getElementById('statTotalEventosPainel');
      const elInsc = document.getElementById('statTotalInscritosGeral');
      const elForm = document.getElementById('statEventosComFormulario');
      const elZap = document.getElementById('statEventosWhatsapp');

      if (elTotal) elTotal.textContent = total;
      if (elInsc) elInsc.textContent = totalInscritos;
      if (elForm) elForm.textContent = comForm;
      if (elZap) elZap.textContent = comWhats;
    }

    function renderEventosPainel(eventos) {
      const grid = document.getElementById('gridEventosPainel');
      if (!grid) return;

      if (!eventos || eventos.length === 0) {
        grid.innerHTML = '<div style="color: var(--cor-texto-mutado); font-size: 0.9rem; padding: 2.5rem 1.5rem; text-align: center; background: var(--cor-card-alt); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.15); grid-column: 1 / -1;">' +
          '<span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">✨</span>' +
          '<strong>Nenhum evento criado ainda!</strong><br>' +
          '<span style="font-size: 0.85rem; color: #a1a1aa;">Clique no botão <strong>"+ Criar Novo Evento"</strong> acima para subir fotos, criar ficha de inscrição ou direcionar pro WhatsApp!</span>' +
        '</div>';
        return;
      }

      grid.innerHTML = eventos.map(ev => {
        let badgeTipo = '📝 Inscrição no Site';
        let corBadgeTipo = 'background: rgba(0, 188, 212, 0.15); color: #00bcd4; border: 1px solid rgba(0, 188, 212, 0.35);';

        if (ev.tipoInscricao === 'whatsapp') {
          badgeTipo = '💬 Direto pro Whats';
          corBadgeTipo = 'background: rgba(37, 211, 102, 0.15); color: #4ade80; border: 1px solid rgba(37, 211, 102, 0.35);';
        } else if (ev.tipoInscricao === 'externo') {
          badgeTipo = '🔗 Inscrição Externa';
          corBadgeTipo = 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35);';
        }

        let isPassado = false;
        if (ev.dataEvento) {
          const p = ev.dataEvento.trim().split(/[\/\-]/);
          if (p.length === 3) {
            const d = p[0].length === 4
              ? new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 23, 59, 59)
              : new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10), 23, 59, 59);
            if (!isNaN(d.getTime()) && d < new Date()) isPassado = true;
          }
        }

        const badgeStatus = isPassado
          ? '<span style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.35);">🏁 Já Realizado</span>'
          : (ev.ativo
            ? '<span style="background: rgba(34, 197, 94, 0.15); color: #4ade80; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(34, 197, 94, 0.35);">🟢 Ativo</span>'
            : '<span style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.35);">⏸️ Pausado</span>');

        const thumbImg = ev.bannerUrl
          ? '<img src="' + ev.bannerUrl + '" class="card-evento-dinamico-thumb" alt="' + ev.titulo + '" />'
          : '<div class="card-evento-dinamico-thumb" style="display: flex; align-items: center; justify-content: center; font-size: 2.2rem; background: linear-gradient(135deg, #1f2937, #111827);">📅</div>';

        const dataLocal = [ev.dataEvento, ev.horario, ev.local].filter(Boolean).join(' • ');

        const botaoInscritos = ev.tipoInscricao === 'formulario'
          ? '<button data-id="' + ev.id + '" onclick="abrirModalInscritosEvento(this.dataset.id)" style="background: rgba(0, 188, 212, 0.12); color: var(--cor-ciano); border: 1px solid rgba(0, 188, 212, 0.3); padding: 7px 12px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">' +
              '👥 Ver ' + (ev.totalInscritos || 0) + ' Inscritos' +
            '</button>'
          : '';

        return '<div class="card-evento-dinamico">' +
          thumbImg +
          '<div class="card-evento-dinamico-body">' +
            '<div class="card-evento-dinamico-badges">' +
              '<span style="' + corBadgeTipo + ' font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 6px;">' + badgeTipo + '</span>' +
              badgeStatus +
            '</div>' +
            '<h4 style="color: #fff; font-size: 1.15rem; margin: 2px 0 0; line-height: 1.3;">' + ev.titulo + '</h4>' +
            '<div style="font-size: 0.82rem; color: var(--cor-texto-mutado);">' + (dataLocal || 'Data e local a definir') + '</div>' +
            '<div class="card-evento-dinamico-acoes">' +
              '<button data-slug="' + ev.slug + '" onclick="copiarLinkEvento(this.dataset.slug)" style="background: rgba(255, 255, 255, 0.08); color: #fff; border: 1px solid rgba(255, 255, 255, 0.15); padding: 7px 11px; border-radius: 8px; font-weight: 600; font-size: 0.8rem; cursor: pointer;" title="Copiar link da página">' +
                '🔗 Copiar Link' +
              '</button>' +
              '<button data-slug="' + ev.slug + '" onclick="abrirPaginaEvento(this.dataset.slug)" style="background: rgba(255, 255, 255, 0.08); color: #fff; border: 1px solid rgba(255, 255, 255, 0.15); padding: 7px 11px; border-radius: 8px; font-weight: 600; font-size: 0.8rem; cursor: pointer;" title="Abrir página do evento">' +
                '👁️ Abrir' +
              '</button>' +
              botaoInscritos +
              '<button data-id="' + ev.id + '" onclick="alternarStatusEventoPainel(this.dataset.id)" style="background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12); padding: 7px 9px; border-radius: 8px; font-size: 0.8rem; cursor: pointer;" title="' + (ev.ativo ? 'Pausar evento' : 'Ativar evento') + '">' +
                (ev.ativo ? '⏸️' : '▶️') +
              '</button>' +
              '<button data-id="' + ev.id + '" onclick="excluirEventoPainel(this.dataset.id)" style="background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.25); padding: 7px 9px; border-radius: 8px; font-size: 0.8rem; cursor: pointer;" title="Excluir evento">' +
                '🗑️' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function abrirPaginaEvento(slug) {
      if (slug) window.open('/evento/' + slug, '_blank');
    }

    function copiarLinkEvento(slug) {
      const url = window.location.origin + '/evento/' + slug;
      navigator.clipboard.writeText(url).then(() => {
        mostrarToast('Link copiado: /evento/' + slug);
      }).catch(() => {
        prompt('Copie o link abaixo:', url);
      });
    }

    async function alternarStatusEventoPainel(id) {
      try {
        const res = await fetch('/secretaria/api/eventos-painel/' + id + '/toggle', { method: 'POST' });
        if (res.ok) {
          mostrarToast('Status do evento alterado.');
          fetchEventosPainel();
        }
      } catch (err) {
        mostrarToast('Erro ao alternar status do evento.', 'erro');
      }
    }

    async function excluirEventoPainel(id) {
      const ev = eventosPainelCache.find(e => String(e.id) === String(id));
      const titulo = ev ? ev.titulo : 'este evento';
      const confirmou = confirm('Tem certeza que deseja excluir o evento "' + titulo + '" e todas as suas inscrições?');
      if (!confirmou) return;
      try {
        const res = await fetch('/secretaria/api/eventos-painel/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.ok) {
          mostrarToast('Evento excluído com sucesso!');
          fetchEventosPainel();
        } else {
          mostrarToast(data.message || 'Erro ao excluir evento.', 'erro');
        }
      } catch (err) {
        mostrarToast('Erro de conexão ao excluir evento.', 'erro');
      }
    }

    // Modal de Inscritos
    async function abrirModalInscritosEvento(eventoId) {
      modalEventoAtualId = eventoId;
      const modal = document.getElementById('modalInscritosEventoDinamico');
      const tituloEl = document.getElementById('modalInscritosTitulo');
      const subtituloEl = document.getElementById('modalInscritosSubtitulo');
      const thead = document.getElementById('modalInscritosTableThead');
      const tbody = document.getElementById('modalInscritosTableTbody');
      const btnPdf = document.getElementById('btnExportarPdfModal');

      if (!modal) return;
      modal.style.display = 'flex';
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--cor-texto-mutado);">Carregando participantes...</td></tr>';

      try {
        const res = await fetch('/secretaria/api/eventos-painel/' + eventoId + '/inscricoes');
        if (!res.ok) throw new Error('Falha ao buscar inscritos');
        const data = await res.json();
        modalEventoAtualObj = data.evento;
        modalInscricoesCache = data.inscricoes || [];

        if (tituloEl && modalEventoAtualObj) tituloEl.textContent = 'Inscritos — ' + modalEventoAtualObj.titulo;
        if (subtituloEl) subtituloEl.textContent = modalInscricoesCache.length + ' participante(s) cadastrado(s)';

        if (btnPdf) {
          btnPdf.onclick = () => window.open('/secretaria/api/eventos-painel/' + eventoId + '/relatorio-pdf', '_blank');
        }

        renderTabelaInscritosModal(modalInscricoesCache);
      } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#fca5a5;">Erro ao carregar lista de inscritos.</td></tr>';
      }
    }

    function fecharModalInscritosEvento(e) {
      if (e && e.target && e.target.id !== 'modalInscritosEventoDinamico' && e.target.tagName !== 'BUTTON') return;
      const modal = document.getElementById('modalInscritosEventoDinamico');
      if (modal) modal.style.display = 'none';
    }

    function renderTabelaInscritosModal(lista) {
      const thead = document.getElementById('modalInscritosTableThead');
      const tbody = document.getElementById('modalInscritosTableTbody');
      if (!thead || !tbody) return;

      const perguntas = (modalEventoAtualObj && modalEventoAtualObj.perguntas) || [];

      let headersCols = '<th style="width: 40px; text-align: center;">Nº</th>' +
        '<th>Nome Completo</th>' +
        '<th>Telefone / WhatsApp</th>' +
        '<th>E-mail</th>';

      perguntas.forEach(p => {
        headersCols += '<th>' + (p.label || 'Pergunta') + '</th>';
      });

      headersCols += '<th style="width: 80px; text-align: center;">Ações</th>';
      thead.innerHTML = '<tr>' + headersCols + '</tr>';

      if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="' + (5 + perguntas.length) + '" style="text-align: center; color: var(--cor-texto-mutado); padding: 2.5rem;">Nenhum participante inscrito encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = lista.map((item, idx) => {
        const telFmt = item.telefone ? item.telefone.replace(/^(\\d{2})(\\d{4,5})(\\d{4})$/, '($1) $2-$3') : '-';
        const respostas = item.respostas || {};

        let respCols = '';
        perguntas.forEach((p, pIdx) => {
          const campoId = 'perg_' + (p.id || pIdx);
          const v = respostas[campoId] || '-';
          const det = respostas[campoId + '_detalhes'];
          if (det) {
            respCols += '<td>' + v + ': <small style="color:var(--cor-ciano);">' + det + '</small></td>';
          } else {
            respCols += '<td>' + v + '</td>';
          }
        });

        return '<tr>' +
          '<td style="text-align:center; font-weight:bold; color:var(--cor-texto-mutado);">' + (idx + 1) + '</td>' +
          '<td><strong style="color:#fff;">' + (item.nome || '-') + '</strong></td>' +
          '<td>' + telFmt + '</td>' +
          '<td style="font-size:0.85rem; color:var(--cor-texto-mutado);">' + (item.email || '-') + '</td>' +
          respCols +
          '<td style="text-align:center;">' +
            '<button data-id="' + item.id + '" data-evento="' + item.eventoId + '" onclick="excluirInscricaoEventoDinamico(this.dataset.id, this.dataset.evento)" style="background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); padding:5px 9px; border-radius:6px; font-size:0.75rem; cursor:pointer;" title="Excluir inscrição">🗑️</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function filtrarInscritosEventoDinamico() {
      const termo = (document.getElementById('modalBuscaInscritosInput')?.value || '').toLowerCase().trim();
      const filtrados = modalInscricoesCache.filter(item => {
        if (!termo) return true;
        const nomeStr = (item.nome || '').toLowerCase();
        const telStr = (item.telefone || '').toLowerCase();
        const emailStr = (item.email || '').toLowerCase();
        const respStr = JSON.stringify(item.respostas || {}).toLowerCase();
        return nomeStr.includes(termo) || telStr.includes(termo) || emailStr.includes(termo) || respStr.includes(termo);
      });
      renderTabelaInscritosModal(filtrados);
    }

    async function excluirInscricaoEventoDinamico(id, eventoId) {
      const item = modalInscricoesCache.find(i => String(i.id) === String(id));
      const nome = item ? item.nome : 'este participante';
      if (!confirm('Excluir inscrição de "' + nome + '"?')) return;
      try {
        const res = await fetch('/secretaria/api/eventos-inscricoes/' + id, { method: 'DELETE' });
        if (res.ok) {
          mostrarToast('Inscrição removida.');
          abrirModalInscritosEvento(eventoId);
          fetchEventosPainel();
        }
      } catch (err) {
        mostrarToast('Erro ao excluir inscrição.', 'erro');
      }
    }

    function openTab(evt, name) {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(name).classList.add('active');
      evt.currentTarget.classList.add('active');
      if(name === 'tab-eventos') { 
        fetchMulheresInscricoes(); 
        fetchCriancasInscricoes(); 
        fetchSaudeMulherInscricoes(); 
        fetchEventosCadastrados(); 
        fetchEventosPainel(); 
      }
      if(name === 'tab-admin') fetchUsers();
      if(name === 'tab-lideres') fetchLideres();
    }

    let tipoDuracaoAtual = 'unico';
    let blocosMultiplosData = [];

    function toggleFormNovoEvento(forcar) {
      const card = document.getElementById('cardNovoEvento');
      const btn = document.getElementById('btnToggleNovoEvento');
      if (!card) return;
      const aberto = forcar !== undefined ? forcar : (card.style.display === 'none' || !card.style.display);
      card.style.display = aberto ? 'block' : 'none';
      if (btn) btn.textContent = aberto ? '✕ Fechar Formulário' : '➕ Agendar Novo Evento';
      if (aberto) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (blocosMultiplosData.length === 0) {
          adicionarBlocoMultiplo();
        }
      }
    }

    function trocarTipoDuracao(tipo) {
      tipoDuracaoAtual = tipo;
      const pUnico = document.getElementById('painelDuracaoUnico');
      const pConsec = document.getElementById('painelDuracaoConsecutivo');
      const pMult = document.getElementById('painelDuracaoMultiplo');

      const lUnico = document.getElementById('lblTipoUnico');
      const lConsec = document.getElementById('lblTipoConsecutivo');
      const lMult = document.getElementById('lblTipoMultiplo');

      if (pUnico) pUnico.style.display = tipo === 'unico' ? 'block' : 'none';
      if (pConsec) pConsec.style.display = tipo === 'consecutivo' ? 'block' : 'none';
      if (pMult) pMult.style.display = tipo === 'multiplo' ? 'block' : 'none';

      const ativoEstilo = 'background: rgba(0, 188, 212, 0.2); border: 1px solid var(--cor-ciano);';
      const inativoEstilo = 'background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12);';

      if (lUnico) lUnico.style.cssText += tipo === 'unico' ? ativoEstilo : inativoEstilo;
      if (lConsec) lConsec.style.cssText += tipo === 'consecutivo' ? ativoEstilo : inativoEstilo;
      if (lMult) lMult.style.cssText += tipo === 'multiplo' ? ativoEstilo : inativoEstilo;

      if (tipo === 'multiplo' && blocosMultiplosData.length === 0) {
        adicionarBlocoMultiplo();
      }
    }

    function adicionarBlocoMultiplo(dados) {
      blocosMultiplosData.push(dados || { data: '', inicio: '19:00', fim: '21:30', titulo: '' });
      renderBlocosMultiplos();
    }

    function removerBlocoMultiplo(idx) {
      if (blocosMultiplosData.length <= 1) {
        alert('O evento deve conter pelo menos uma sessão.');
        return;
      }
      blocosMultiplosData.splice(idx, 1);
      renderBlocosMultiplos();
    }

    function renderBlocosMultiplos() {
      const container = document.getElementById('listaBlocosMultiplos');
      if (!container) return;
      container.innerHTML = '';
      blocosMultiplosData.forEach((b, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'display: grid; grid-template-columns: 140px 110px 110px 1fr 40px; gap: 8px; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);';
        div.innerHTML = 
          '<div><label style="font-size: 0.72rem; color: #a1a1aa; display:block;">Data *</label><input type="date" value="' + (b.data || '') + '" onchange="blocosMultiplosData[' + idx + '].data = this.value" style="margin: 0; padding: 6px 8px; font-size: 0.85rem;" required /></div>' +
          '<div><label style="font-size: 0.72rem; color: #a1a1aa; display:block;">Início *</label><input type="time" value="' + (b.inicio || '19:00') + '" onchange="blocosMultiplosData[' + idx + '].inicio = this.value" style="margin: 0; padding: 6px 8px; font-size: 0.85rem;" required /></div>' +
          '<div><label style="font-size: 0.72rem; color: #a1a1aa; display:block;">Término *</label><input type="time" value="' + (b.fim || '21:30') + '" onchange="blocosMultiplosData[' + idx + '].fim = this.value" style="margin: 0; padding: 6px 8px; font-size: 0.85rem;" required /></div>' +
          '<div><label style="font-size: 0.72rem; color: #a1a1aa; display:block;">Rótulo / Sessão (Opcional)</label><input type="text" placeholder="Ex: Sessão 1" value="' + (b.titulo || '') + '" onchange="blocosMultiplosData[' + idx + '].titulo = this.value" style="margin: 0; padding: 6px 8px; font-size: 0.85rem;" /></div>' +
          '<div style="text-align: right; padding-top: 14px;"><button type="button" onclick="removerBlocoMultiplo(' + idx + ')" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: none; padding: 6px 8px; border-radius: 6px; cursor: pointer;">✕</button></div>';
        container.appendChild(div);
      });
    }

    function coletarDadosFormularioEvento() {
      const nome = (document.getElementById('evNome')?.value || '').trim();
      const departamento = document.getElementById('evDepartamento')?.value || 'Comunidade Cristã Curados';
      const local = (document.getElementById('evLocal')?.value || '').trim() || 'Comunidade Cristã Curados';
      const tema = (document.getElementById('evTema')?.value || '').trim();
      const descricao = (document.getElementById('evDescricao')?.value || '').trim();

      let horarios = null;
      if (tipoDuracaoAtual === 'unico') {
        const data = document.getElementById('evUnicoData')?.value;
        const inicio = document.getElementById('evUnicoInicio')?.value;
        const fim = document.getElementById('evUnicoFim')?.value;
        horarios = [{ data, inicio, fim }];
      } else if (tipoDuracaoAtual === 'consecutivo') {
        const dataInicio = document.getElementById('evConsecDataIni')?.value;
        const horaInicio = document.getElementById('evConsecHoraIni')?.value;
        const dataFim = document.getElementById('evConsecDataFim')?.value;
        const horaFim = document.getElementById('evConsecHoraFim')?.value;
        horarios = { dataInicio, horaInicio, dataFim, horaFim };
      } else if (tipoDuracaoAtual === 'multiplo') {
        horarios = blocosMultiplosData.map(b => ({
          data: b.data,
          inicio: b.inicio,
          fim: b.fim,
          titulo: b.titulo
        }));
      }

      return {
        evento: nome,
        departamento,
        local,
        tema,
        tipoDuracao: tipoDuracaoAtual,
        horarios,
        descricao
      };
    }

    async function gerarDescricaoIaWeb() {
      const dados = coletarDadosFormularioEvento();
      if (!dados.evento) {
        alert('Por favor, informe o Nome do Evento antes de gerar a descrição com IA.');
        document.getElementById('evNome')?.focus();
        return;
      }

      const btn = document.getElementById('btnGerarDescricaoIa');
      const textarea = document.getElementById('evDescricao');
      const originalText = btn ? btn.textContent : '';
      if (btn) {
        btn.textContent = '⏳ Gerando com IA...';
        btn.disabled = true;
      }

      try {
        const res = await fetch('/secretaria/api/eventos/gerar-descricao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
        const json = await res.json();
        if (res.ok && json.descricao) {
          if (textarea) textarea.value = json.descricao;
        } else {
          alert('Erro ao gerar descrição: ' + (json.message || 'Falha na resposta'));
        }
      } catch (err) {
        console.error('Erro ao gerar descrição:', err);
        alert('Erro ao conectar ao servidor para gerar descrição.');
      } finally {
        if (btn) {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      }
    }

    async function salvarNovoEventoWeb(e) {
      e.preventDefault();
      const dados = coletarDadosFormularioEvento();
      const msgEl = document.getElementById('eventoFormMessage');
      if (msgEl) msgEl.style.display = 'none';

      // Validação de horário de início obrigatório no cliente
      if (dados.tipoDuracao === 'unico') {
        const h = dados.horarios[0];
        if (!h.data || !h.inicio || !h.fim) {
          mostrarMensagemEvento('Preencha a data, horário de início e término.', false);
          return;
        }
      } else if (dados.tipoDuracao === 'consecutivo') {
        const h = dados.horarios;
        if (!h.dataInicio || !h.horaInicio || !h.dataFim || !h.horaFim) {
          mostrarMensagemEvento('Preencha as datas e horários de início e término.', false);
          return;
        }
      } else if (dados.tipoDuracao === 'multiplo') {
        if (!dados.horarios || dados.horarios.length === 0) {
          mostrarMensagemEvento('Adicione pelo menos uma sessão com data e horários.', false);
          return;
        }
        for (let i = 0; i < dados.horarios.length; i++) {
          const b = dados.horarios[i];
          if (!b.data || !b.inicio || !b.fim) {
            mostrarMensagemEvento('A sessão ' + (i + 1) + ' precisa de data, início e término preenchidos.', false);
            return;
          }
        }
      }

      const btn = document.getElementById('btnSalvarEvento');
      if (btn) {
        btn.textContent = '⏳ Salvando...';
        btn.disabled = true;
      }

      try {
        const res = await fetch('/secretaria/api/eventos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        });
        const json = await res.json();
        if (res.ok) {
          mostrarMensagemEvento('✅ ' + (json.message || 'Evento salvo com sucesso!'), true);
          document.getElementById('formNovoEvento')?.reset();
          if (document.getElementById('evDescricao')) document.getElementById('evDescricao').value = '';
          blocosMultiplosData = [];
          renderBlocosMultiplos();
          setTimeout(() => {
            toggleFormNovoEvento(false);
            fetchEventosCadastrados();
          }, 1200);
        } else {
          mostrarMensagemEvento('❌ ' + (json.message || 'Erro ao salvar evento.'), false);
        }
      } catch (err) {
        console.error('Erro ao salvar evento:', err);
        mostrarMensagemEvento('❌ Erro de conexão ao salvar evento.', false);
      } finally {
        if (btn) {
          btn.textContent = 'Salvar e Agendar Evento';
          btn.disabled = false;
        }
      }
    }

    function mostrarMensagemEvento(texto, sucesso) {
      const msgEl = document.getElementById('eventoFormMessage');
      if (!msgEl) return;
      msgEl.style.display = 'block';
      msgEl.textContent = texto;
      msgEl.style.backgroundColor = sucesso ? 'rgba(22, 163, 74, 0.2)' : 'rgba(220, 38, 38, 0.2)';
      msgEl.style.color = sucesso ? '#86efac' : '#fca5a5';
      msgEl.style.border = sucesso ? '1px solid rgba(22, 163, 74, 0.4)' : '1px solid rgba(220, 38, 38, 0.4)';
    }

    async function fetchEventosCadastrados() {
      const grid = document.getElementById('gridEventosCadastrados');
      if (!grid) return;
      try {
        const res = await fetch('/secretaria/api/eventos');
        if (!res.ok) return;
        const data = await res.json();
        renderEventosCadastrados(data.eventos || []);
      } catch (err) {
        console.error('Erro ao listar eventos:', err);
        grid.innerHTML = '<div style="color: #f87171; padding: 1rem;">Erro ao carregar eventos cadastrados.</div>';
      }
    }

    function renderEventosCadastrados(eventos) {
      const grid = document.getElementById('gridEventosCadastrados');
      if (!grid) return;
      if (!eventos || eventos.length === 0) {
        grid.innerHTML = '<div style="color: var(--cor-texto-mutado); font-size: 0.9rem; padding: 1.5rem; background: var(--cor-card-alt); border-radius: 12px; border: 1px solid var(--cor-borda); grid-column: 1 / -1;">Nenhum evento cadastrado ainda. Clique em "➕ Agendar Novo Evento" acima para cadastrar o primeiro!</div>';
        return;
      }

      grid.innerHTML = eventos.map(ev => {
        let formatoBadge = '1 DIA';
        let corBadge = 'background: rgba(0, 188, 212, 0.15); color: #00bcd4; border: 1px solid rgba(0, 188, 212, 0.35);';
        let horarioTexto = '';

        if (ev.tipoDuracao === 'consecutivo') {
          formatoBadge = 'CONSECUTIVO';
          corBadge = 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35);';
          const h = Array.isArray(ev.horarios) ? ev.horarios[0] : ev.horarios;
          horarioTexto = (h?.dataInicio || '') + ' (' + (h?.horaInicio || '') + ') até ' + (h?.dataFim || '') + ' (' + (h?.horaFim || '') + ')';
        } else if (ev.tipoDuracao === 'multiplo') {
          formatoBadge = 'MÚLTIPLOS BLOCOS';
          corBadge = 'background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.35);';
          const totalSessoes = Array.isArray(ev.horarios) ? ev.horarios.length : 1;
          horarioTexto = totalSessoes + ' sessões / dias cadastrados';
        } else {
          const h = Array.isArray(ev.horarios) ? ev.horarios[0] : ev.horarios;
          horarioTexto = (h?.data || '') + ' das ' + (h?.inicio || '') + ' às ' + (h?.fim || '');
        }

        const safeDescricao = (ev.descricao || '').replace(/"/g, '&quot;');

        return '<div style="background: var(--cor-card-alt); border: 1px solid var(--cor-borda); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.2);">' +
          '<div>' +
            '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">' +
              '<span class="badge" style="' + corBadge + '; margin: 0;">' + formatoBadge + '</span>' +
              '<span style="font-size: 0.74rem; color: #a1a1aa;">' + (ev.departamento || 'Igreja') + '</span>' +
            '</div>' +
            '<h5 style="font-size: 1.05rem; color: #fff; margin: 0 0 6px; font-weight: 700;">' + ev.evento + '</h5>' +
            '<p style="font-size: 0.82rem; color: var(--cor-texto-mutado); margin: 0 0 4px;">🗓️ ' + horarioTexto + '</p>' +
            '<p style="font-size: 0.8rem; color: #9ca3af; margin: 0;">📍 ' + (ev.local || 'Comunidade Cristã Curados') + '</p>' +
          '</div>' +
          '<div style="display: flex; gap: 8px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; margin-top: 4px;">' +
            '<button type="button" onclick="toggleCardDescricao(this)" data-desc="' + safeDescricao + '" style="flex: 1; background: rgba(0,188,212,0.12); color: var(--cor-ciano); border: 1px solid rgba(0,188,212,0.3); padding: 6px 10px; font-size: 0.8rem; border-radius: 8px; cursor: pointer;">✨ Ver Descrição IA</button>' +
          '</div>' +
          '<div class="box-desc-preview" style="display: none; background: #0c0c10; padding: 10px; border-radius: 8px; font-size: 0.78rem; line-height: 1.4; color: #e4e4e7; white-space: pre-wrap; max-height: 160px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1);">' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function toggleCardDescricao(btn) {
      const card = btn.closest('div').parentElement;
      const box = card.querySelector('.box-desc-preview');
      if (!box) return;
      const aberto = box.style.display === 'block';
      box.style.display = aberto ? 'none' : 'block';
      if (!aberto) {
        box.textContent = btn.getAttribute('data-desc') || 'Sem descrição cadastrada.';
        btn.textContent = '✕ Ocultar Descrição';
      } else {
        btn.textContent = '✨ Ver Descrição IA';
      }
    }



    async function sincronizarComPlanilhaMulheres() {
      const btn = document.getElementById('btnSyncPlanilhaMulheres');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Sincronizando...';
      }
      try {
        const res = await fetch('/mulheres/api/sincronizar', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.ok) {
          alert('✅ Sincronização concluída com sucesso!\\n' + (data.total || 0) + ' inscrições sincronizadas da planilha.');
          await fetchMulheresInscricoes();
        } else {
          alert('⚠️ Aviso ao sincronizar: ' + (data.error || data.message || 'Verifique a configuração do Apps Script'));
        }
      } catch (err) {
        alert('Erro ao sincronizar com a planilha: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText || '🔄 Puxar da Planilha';
        }
      }
    }

    function getBtnGaveta(nomeEvento) {
      if (nomeEvento === 'criancas') return document.getElementById('btnToggleCriancas');
      if (nomeEvento === 'theChosen') return document.getElementById('btnToggleTheChosen');
      if (nomeEvento === 'saude_mulher') return document.getElementById('btnToggleSaudeMulher');
      if (nomeEvento === 'intercessao') return document.getElementById('btnToggleIntercessao');
      return document.getElementById('btnToggleMulheres');
    }

    function toggleGavetaEvento(nomeEvento) {
      const gaveta = document.getElementById('gaveta-' + nomeEvento);
      const btn = getBtnGaveta(nomeEvento);
      if (!gaveta || !btn) return;

      const isRecolhida = gaveta.classList.contains('recolhida');
      const textEl = btn.querySelector('.gaveta-toggle-text');
      const arrowEl = btn.querySelector('.gaveta-arrow');

      if (isRecolhida) {
        gaveta.classList.remove('recolhida');
        btn.classList.remove('recolhida');
        if (textEl) textEl.textContent = 'Recolher';
        if (arrowEl) arrowEl.innerHTML = '▲';
        localStorage.setItem('gaveta_' + nomeEvento, 'aberta');
      } else {
        gaveta.classList.add('recolhida');
        btn.classList.add('recolhida');
        if (textEl) textEl.textContent = 'Abrir';
        if (arrowEl) arrowEl.innerHTML = '▼';
        localStorage.setItem('gaveta_' + nomeEvento, 'fechada');
      }
    }

    function restaurarEstadoGavetas() {
      ['criancas', 'mulheres', 'saude_mulher', 'intercessao'].forEach(nomeEvento => {
        const salvo = localStorage.getItem('gaveta_' + nomeEvento);
        if (salvo === 'fechada') {
          const gaveta = document.getElementById('gaveta-' + nomeEvento);
          const btn = getBtnGaveta(nomeEvento);
          if (gaveta && btn) {
            gaveta.classList.add('recolhida');
            btn.classList.add('recolhida');
            const textEl = btn.querySelector('.gaveta-toggle-text');
            const arrowEl = btn.querySelector('.gaveta-arrow');
            if (textEl) textEl.textContent = 'Abrir';
            if (arrowEl) arrowEl.innerHTML = '▼';
          }
        }
      });
    }

    /* =========================================================================
       FRONTEND: Especial Dia das Crianças
       ========================================================================= */
    let criancasInscricoesCache = [];

    async function fetchCriancasInscricoes() {
      try {
        const res = await fetch('/criancas/api/inscritas');
        if (res.status === 401) { window.location.href = '/secretaria/login'; return; }
        if (!res.ok) return;
        const data = await res.json();
        criancasInscricoesCache = data.inscricoes || [];

        const stats = data.stats || {};
        const elTotal = document.getElementById('criancasTotal');
        const elZap = document.getElementById('criancasConfirmadosZap');
        const elPend = document.getElementById('criancasPendentesZap');

        if (elTotal) elTotal.textContent = stats.total !== undefined ? stats.total : criancasInscricoesCache.length;
        if (elZap) elZap.textContent = stats.whatsappConfirmados || 0;
        if (elPend) elPend.textContent = stats.pendentesConfirmacao || 0;

        filtrarCriancasInscricoes();
      } catch (err) {
        console.error('Erro ao buscar inscritos do Dia das Crianças:', err);
      }
    }

    function filtrarCriancasInscricoes() {
      const termo = (document.getElementById('criancasSearchInput')?.value || '').toLowerCase().trim();
      const filtrados = criancasInscricoesCache.filter(item => {
        if (!termo) return true;
        const criancaStr = (item.nomeCrianca || '').toLowerCase();
        const respStr = (item.nomeResponsavel || '').toLowerCase();
        const telStr = (item.telefone || '').toLowerCase();
        const alergiaStr = ((item.alergiaAlimentos || '') + ' ' + (item.alergiaMedicamentos || '')).toLowerCase();
        return criancaStr.includes(termo) || respStr.includes(termo) || telStr.includes(termo) || alergiaStr.includes(termo);
      });
      renderCriancasTable(filtrados);
    }

    function renderCriancasTable(lista) {
      const tbody = document.getElementById('criancasTbodyInscritos');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--cor-texto-mutado); padding: 2rem;">Nenhuma criança inscrita encontrada.</td></tr>';
        return;
      }

      tbody.innerHTML = lista.map((item, idx) => {
        const telFormatado = item.telefone ? item.telefone.replace(/^(\\d{2})(\\d{4,5})(\\d{4})$/, '($1) $2-$3') : '-';
        const dataCriacao = item.criadoEm ? new Date(item.criadoEm).toLocaleDateString('pt-BR') : '-';

        let alergiasHtml = '<span style="color: #94a3b8; font-size: 0.82rem;">Nenhuma</span>';
        const alergias = [];
        if (item.alergiaAlimentos && !/n[aã]o|nenhum/i.test(item.alergiaAlimentos)) {
          alergias.push('🍽️ ' + item.alergiaAlimentos);
        }
        if (item.alergiaMedicamentos && !/n[aã]o|nenhum/i.test(item.alergiaMedicamentos)) {
          alergias.push('💊 ' + item.alergiaMedicamentos);
        }
        if (alergias.length > 0) {
          alergiasHtml = '<span style="background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35); padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; display: inline-block;">' +
            alergias.join(' | ') +
            '</span>';
        }

        return '<tr>' +
          '<td style="text-align: center; font-weight: bold; color: var(--cor-texto-mutado);">' + (idx + 1) + '</td>' +
          '<td><strong style="color: #fff; font-size: 0.95rem;">' + (item.nomeCrianca || '-') + '</strong></td>' +
          '<td style="text-align: center; font-size: 0.88rem; color: #38bdf8; font-weight: 600;">' + (item.idade || '-') + '</td>' +
          '<td style="font-size: 0.88rem; color: #cbd5e1;">' + (item.nomeResponsavel || '-') + '</td>' +
          '<td style="font-size: 0.88rem;">' + telFormatado + '</td>' +
          '<td>' + alergiasHtml + '</td>' +
          '<td style="text-align: center; font-size: 0.85rem; color: var(--cor-texto-mutado);">' + dataCriacao + '</td>' +
          '<td style="text-align: center;">' +
            '<button data-id="' + (item.id || '') + '" data-nome="' + (item.nomeCrianca || '').replace(/"/g, '&quot;') + '" onclick="excluirCriancaInscricao(this.dataset.id, this.dataset.nome)" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">' +
              '🗑️ Excluir' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function excluirCriancaInscricao(id, nome) {
      if (!id) return;
      const confirmou = confirm('Tem certeza que deseja excluir a inscrição de "' + (nome || 'Criança') + '"?');
      if (!confirmou) return;

      try {
        const res = await fetch('/criancas/api/excluir-inscricao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          fetchCriancasInscricoes();
        } else {
          alert(data.message || 'Erro ao excluir inscrição.');
        }
      } catch (err) {
        console.error('Erro ao excluir inscrição de criança:', err);
        alert('Erro ao conectar com o servidor.');
      }
    }

    async function sincronizarComPlanilhaCriancas() {
      const btn = document.getElementById('btnSyncPlanilhaCriancas');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Sincronizando...';
      }
      try {
        const res = await fetch('/criancas/api/sincronizar', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.ok) {
          alert('✅ Sincronização concluída com sucesso!\\n' + (data.total || 0) + ' inscrições de crianças sincronizadas da planilha.');
          await fetchCriancasInscricoes();
        } else {
          alert('⚠️ Aviso ao sincronizar: ' + (data.error || data.message || 'Verifique a configuração do Apps Script'));
        }
      } catch (err) {
        alert('Erro ao sincronizar com a planilha: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText || '🔄 Puxar da Planilha';
        }
      }
    }

    /* =========================================================================
       FRONTEND: Culto de Mulheres — O Vaso e o Oleiro
       ========================================================================= */
    let mulheresInscricoesCache = [];

    async function fetchMulheresInscricoes() {
      try {
        const res = await fetch('/mulheres/api/inscritas');
        if (res.status === 401) { window.location.href = '/secretaria/login'; return; }
        if (!res.ok) return;
        const data = await res.json();
        mulheresInscricoesCache = data.inscricoes || [];

        const stats = data.stats || {};
        const elTotal = document.getElementById('mulheresTotal');
        const elZap = document.getElementById('mulheresConfirmadosZap');
        const elPend = document.getElementById('mulheresPendentesZap');

        if (elTotal) elTotal.textContent = stats.total !== undefined ? stats.total : mulheresInscricoesCache.length;
        if (elZap) elZap.textContent = stats.whatsappConfirmados || 0;
        if (elPend) elPend.textContent = stats.pendentesConfirmacao || 0;

        filtrarMulheresInscricoes();
      } catch (err) {
        console.error('Erro ao buscar inscritas do Culto de Mulheres:', err);
      }
    }

    function filtrarMulheresInscricoes() {
      const termo = (document.getElementById('mulheresSearchInput')?.value || '').toLowerCase().trim();
      const filtrados = mulheresInscricoesCache.filter(item => {
        if (!termo) return true;
        const nomeStr = (item.nome || '').toLowerCase();
        const emailStr = (item.email || '').toLowerCase();
        const telStr = (item.telefone || '').toLowerCase();
        return nomeStr.includes(termo) || emailStr.includes(termo) || telStr.includes(termo);
      });
      renderMulheresTable(filtrados);
    }

    function renderMulheresTable(lista) {
      const tbody = document.getElementById('mulheresTbodyInscritos');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--cor-texto-mutado); padding: 2rem;">Nenhuma participante inscrita encontrada.</td></tr>';
        return;
      }

      tbody.innerHTML = lista.map((item, idx) => {
        const telFormatado = item.telefone ? item.telefone.replace(/^(\\d{2})(\\d{4,5})(\\d{4})$/, '($1) $2-$3') : '-';
        const dataCriacao = item.criadoEm ? new Date(item.criadoEm).toLocaleDateString('pt-BR') : '-';
        const zapStatus = item.whatsappConfirmacaoEnviado
          ? '<span style="color: #4ade80; font-size: 0.85rem; font-weight: 600;">✅ Enviado</span>'
          : '<span style="color: #facc15; font-size: 0.85rem;">⏳ Pendente</span>';

        return '<tr>' +
          '<td style="text-align: center; font-weight: bold; color: var(--cor-texto-mutado);">' + (idx + 1) + '</td>' +
          '<td><strong style="color: #fff; font-size: 0.95rem;">' + (item.nome || '-') + '</strong></td>' +
          '<td style="font-size: 0.88rem; color: #cbd5e1;">' + (item.email || '-') + '</td>' +
          '<td style="font-size: 0.88rem;">' + telFormatado + '</td>' +
          '<td style="text-align: center; font-size: 0.85rem; color: var(--cor-texto-mutado);">' + dataCriacao + '</td>' +
          '<td style="text-align: center;">' + zapStatus + '</td>' +
          '<td style="text-align: center;">' +
            '<button data-id="' + (item.id || '') + '" data-nome="' + (item.nome || '').replace(/"/g, '&quot;') + '" onclick="excluirMulherInscricao(this.dataset.id, this.dataset.nome)" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">' +
              '🗑️ Excluir' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function excluirMulherInscricao(id, nome) {
      if (!id) return;
      const confirmou = confirm('Tem certeza que deseja excluir a inscrição de "' + (nome || 'Participante') + '"?');
      if (!confirmou) return;

      try {
        const res = await fetch('/mulheres/api/excluir-inscricao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          fetchMulheresInscricoes();
        } else {
          alert(data.message || 'Erro ao excluir inscrição.');
        }
      } catch (err) {
        console.error('Erro ao excluir inscrição de mulher:', err);
        alert('Erro ao conectar com o servidor.');
      }
    }

    /* =========================================================================
       FRONTEND: Saúde da Mulher — Pilates (Anamnese)
       ========================================================================= */
    let saudeMulherInscricoesCache = [];

    async function fetchSaudeMulherInscricoes() {
      try {
        const res = await fetch('/saude-mulher/api/inscritas');
        if (res.status === 401) { window.location.href = '/secretaria/login'; return; }
        if (!res.ok) return;
        const data = await res.json();
        saudeMulherInscricoesCache = data.inscricoes || [];

        const stats = data.stats || {};
        const elTotal = document.getElementById('saudeMulherTotal');
        const elCond = document.getElementById('saudeMulherComCondicao');
        const elLesao = document.getElementById('saudeMulherComLesao');
        const elGest = document.getElementById('saudeMulherGestantes');

        if (elTotal) elTotal.textContent = stats.total !== undefined ? stats.total : saudeMulherInscricoesCache.length;
        if (elCond) elCond.textContent = stats.comCondicaoSaude || 0;
        if (elLesao) elLesao.textContent = stats.comLesaoDor || 0;
        if (elGest) elGest.textContent = stats.gestantes || 0;

        filtrarSaudeMulherInscricoes();
      } catch (err) {
        console.error('Erro ao buscar inscritas de Saúde da Mulher / Pilates:', err);
      }
    }

    function filtrarSaudeMulherInscricoes() {
      const termo = (document.getElementById('saudeMulherSearchInput')?.value || '').toLowerCase().trim();
      const filtrados = saudeMulherInscricoesCache.filter(item => {
        if (!termo) return true;
        const nomeStr = (item.nome || '').toLowerCase();
        const telStr = (item.telefone || '').toLowerCase();
        const condStr = (item.condicoesSaude || '').toLowerCase();
        const cirurgStr = (item.cirurgiaDetalhes || '').toLowerCase();
        const lesaoStr = (item.lesaoDorDetalhes || '').toLowerCase();
        return nomeStr.includes(termo) || telStr.includes(termo) || condStr.includes(termo) || cirurgStr.includes(termo) || lesaoStr.includes(termo);
      });
      renderSaudeMulherTable(filtrados);
    }

    function renderSaudeMulherTable(lista) {
      const tbody = document.getElementById('saudeMulherTbodyInscritos');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; color: var(--cor-texto-mutado); padding: 2rem;">Nenhuma aluna inscrita encontrada.</td></tr>';
        return;
      }

      tbody.innerHTML = lista.map((item, idx) => {
        const telFormatado = item.telefone ? item.telefone.replace(/^(\\d{2})(\\d{4,5})(\\d{4})$/, '($1) $2-$3') : '-';
        const condicoes = item.condicoesSaude ? '<strong style="color: #fb7185;">' + item.condicoesSaude + '</strong>' : '<span style="color: var(--cor-texto-mutado);">Nenhuma</span>';
        const tratamento = item.tratamentoMedicamento ? '<br><small style="color: #fda4af;">Med: ' + item.tratamentoMedicamento + '</small>' : '';
        const temCirurgia = (item.cirurgia === 'Sim') || (item.cirurgiaDetalhes && !['não', 'nao', 'nenhuma', '-', ''].includes(item.cirurgiaDetalhes.trim().toLowerCase()) && item.cirurgia !== 'Não');
        const cirurgia = temCirurgia
          ? '<span style="color: #f87171; font-weight: 600;">Sim</span>' + (item.cirurgiaDetalhes && !['não', 'nao', '-'].includes(item.cirurgiaDetalhes.trim().toLowerCase()) ? ': <small>' + item.cirurgiaDetalhes + '</small>' : '')
          : '<span style="color: var(--cor-texto-mutado);">Não</span>';

        const temLesao = (item.lesaoDor === 'Sim') || (item.lesaoDorDetalhes && !['não', 'nao', 'nenhuma', '-', ''].includes(item.lesaoDorDetalhes.trim().toLowerCase()) && item.lesaoDor !== 'Não');
        const lesao = temLesao
          ? '<span style="color: #f87171; font-weight: 600;">Sim</span>' + (item.lesaoDorDetalhes && !['não', 'nao', '-'].includes(item.lesaoDorDetalhes.trim().toLowerCase()) ? ': <small>' + item.lesaoDorDetalhes + '</small>' : '')
          : '<span style="color: var(--cor-texto-mutado);">Não</span>';

        const temLimitacao = (item.limitacao === 'Sim') || (item.limitacaoDetalhes && !['não', 'nao', 'nenhuma', '-', ''].includes(item.limitacaoDetalhes.trim().toLowerCase()) && item.limitacao !== 'Não');
        const limitacao = temLimitacao
          ? '<span style="color: #fb923c; font-weight: 600;">Sim</span>' + (item.limitacaoDetalhes && !['não', 'nao', '-'].includes(item.limitacaoDetalhes.trim().toLowerCase()) ? ': <small>' + item.limitacaoDetalhes + '</small>' : '')
          : '<span style="color: var(--cor-texto-mutado);">Não</span>';

        const gravida = item.gravida === 'Sim'
          ? '<span style="background: rgba(244, 63, 94, 0.2); color: #fda4af; font-weight: bold; padding: 2px 6px; border-radius: 4px;">🤰 Sim</span>'
          : '<span style="color: var(--cor-texto-mutado);">Não</span>';

        const temAtividade = item.atividadeFisica === 'Sim';
        const atividade = temAtividade
          ? '<span style="color: #4ade80; font-weight: 600;">Sim</span>' + (item.atividadeFisicaDetalhes && !['não', 'nao', '-'].includes(item.atividadeFisicaDetalhes.trim().toLowerCase()) ? ': <small>' + item.atividadeFisicaDetalhes + '</small>' : '')
          : '<span style="color: var(--cor-texto-mutado);">Não</span>';

        return '<tr>' +
          '<td style="text-align: center; font-weight: bold; color: var(--cor-texto-mutado);">' + (idx + 1) + '</td>' +
          '<td><strong style="color: #fff; font-size: 0.95rem;">' + (item.nome || '-') + '</strong></td>' +
          '<td style="text-align: center; font-size: 0.88rem; color: #fda4af; font-weight: 600;">' + (item.idade || '-') + '</td>' +
          '<td style="font-size: 0.88rem;">' + telFormatado + '</td>' +
          '<td style="font-size: 0.85rem;">' + condicoes + tratamento + '</td>' +
          '<td style="font-size: 0.85rem;">' + cirurgia + '</td>' +
          '<td style="font-size: 0.85rem;">' + lesao + '</td>' +
          '<td style="font-size: 0.85rem;">' + limitacao + '</td>' +
          '<td style="text-align: center;">' + gravida + '</td>' +
          '<td style="font-size: 0.85rem;">' + atividade + '</td>' +
          '<td style="font-size: 0.85rem; color: #e2e8f0;">' + (item.outrasInformacoes || '<span style="color: var(--cor-texto-mutado);">-</span>') + '</td>' +
          '<td style="text-align: center;">' +
            '<button data-id="' + (item.id || '') + '" data-nome="' + (item.nome || '').replace(/"/g, '&quot;') + '" onclick="excluirSaudeMulherInscricao(this.dataset.id, this.dataset.nome)" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">' +
              '🗑️ Excluir' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function excluirSaudeMulherInscricao(id, nome) {
      if (!id) return;
      const confirmou = confirm('Tem certeza que deseja excluir a inscrição de "' + (nome || 'Aluna') + '"?');
      if (!confirmou) return;

      try {
        const res = await fetch('/saude-mulher/api/excluir-inscricao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          fetchSaudeMulherInscricoes();
        } else {
          alert(data.message || 'Erro ao excluir inscrição.');
        }
      } catch (err) {
        console.error('Erro ao excluir inscrição de Pilates:', err);
        alert('Erro ao conectar com o servidor.');
      }
    }

    async function sincronizarComPlanilhaSaudeMulher() {
      const btn = document.getElementById('btnSyncPlanilhaSaudeMulher');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Sincronizando...';
      }
      try {
        const res = await fetch('/saude-mulher/api/sincronizar', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.ok) {
          alert('✅ Sincronização concluída com sucesso!\\n' + (data.message || (data.total || 0) + ' inscrições'));
          await fetchSaudeMulherInscricoes();
        } else {
          alert('⚠️ Aviso ao sincronizar: ' + (data.message || 'Verifique se a planilha está configurada.'));
        }
      } catch (err) {
        alert('Erro ao sincronizar com a planilha: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText || '🔄 Puxar da Planilha';
        }
      }
    }

    /* =========================================================================
       FRONTEND: Treinamento de Intercessão
       ========================================================================= */
    let intercessaoInscricoesCache = [];

    async function fetchIntercessaoInscricoes() {
      try {
        const res = await fetch('/intercessao/api/inscritos');
        if (res.status === 401) { window.location.href = '/secretaria/login'; return; }
        if (!res.ok) return;
        const data = await res.json();
        intercessaoInscricoesCache = data.inscricoes || [];

        const stats = data.stats || {};
        const elTotal = document.getElementById('intercessaoTotal');
        const elExp = document.getElementById('intercessaoComExperiencia');
        const elSemExp = document.getElementById('intercessaoSemExperiencia');
        const elZap = document.getElementById('intercessaoZapConfirmados');

        if (elTotal) elTotal.textContent = stats.total !== undefined ? stats.total : intercessaoInscricoesCache.length;
        if (elExp) elExp.textContent = stats.comExperiencia || 0;
        if (elSemExp) elSemExp.textContent = stats.semExperiencia || 0;
        if (elZap) elZap.textContent = stats.whatsappConfirmado || 0;

        filtrarIntercessaoInscricoes();
      } catch (err) {
        console.error('Erro ao buscar inscritos de Treinamento de Intercessão:', err);
      }
    }

    function filtrarIntercessaoInscricoes() {
      const termo = (document.getElementById('intercessaoSearchInput')?.value || '').toLowerCase().trim();
      const filtrados = intercessaoInscricoesCache.filter(item => {
        if (!termo) return true;
        const nomeStr = (item.nome || '').toLowerCase();
        const telStr = (item.telefone || '').toLowerCase();
        const emailStr = (item.email || '').toLowerCase();
        const expStr = (item.experienciaDetalhes || '').toLowerCase();
        return nomeStr.includes(termo) || telStr.includes(termo) || emailStr.includes(termo) || expStr.includes(termo);
      });
      renderIntercessaoTable(filtrados);
    }

    function renderIntercessaoTable(lista) {
      const tbody = document.getElementById('intercessaoTbodyInscritos');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--cor-texto-mutado); padding: 2rem;">Nenhum participante inscrito encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = lista.map((item, idx) => {
        const telFormatado = item.telefone ? item.telefone.replace(/^(\\d{2})(\\d{4,5})(\\d{4})$/, '($1) $2-$3') : '-';
        const numLimpo = String(item.telefone || '').replace(/\\D/g, '');
        const ddi = numLimpo.startsWith('55') ? numLimpo : ('55' + numLimpo);
        const zapLink = numLimpo ? '<a href="https://wa.me/' + ddi + '" target="_blank" style="color: #4ade80; text-decoration: none; font-weight: 600;">' + telFormatado + '</a>' : '-';
        
        const ehSim = /^sim/i.test(item.experienciaIntercessao || '');
        const badgeExp = ehSim
          ? '<span style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">🛡️ Sim</span>'
          : '<span style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-weight: 600; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">🌱 Primeira Vez</span>';

        const detalhes = item.experienciaDetalhes && item.experienciaDetalhes !== '-'
          ? '<small style="color: #cbd5e1;">' + item.experienciaDetalhes + '</small>'
          : '<span style="color: var(--cor-texto-mutado);">-</span>';

        const dataStr = item.criadoEm ? item.criadoEm.slice(0, 10) : '-';

        return '<tr>' +
          '<td style="text-align: center; font-weight: bold; color: var(--cor-texto-mutado);">' + (idx + 1) + '</td>' +
          '<td><strong style="color: #fff; font-size: 0.95rem;">' + (item.nome || '-') + '</strong></td>' +
          '<td style="font-size: 0.88rem;">' + zapLink + '</td>' +
          '<td style="font-size: 0.85rem; color: #cbd5e1;">' + (item.email || '-') + '</td>' +
          '<td style="text-align: center;">' + badgeExp + '</td>' +
          '<td style="font-size: 0.85rem;">' + detalhes + '</td>' +
          '<td style="text-align: center; font-size: 0.82rem; color: var(--cor-texto-mutado);">' + dataStr + '</td>' +
          '<td style="text-align: center;">' +
            '<button data-id="' + (item.id || '') + '" data-nome="' + (item.nome || '').replace(/"/g, '&quot;') + '" onclick="excluirIntercessaoInscricao(this.dataset.id, this.dataset.nome)" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">' +
              '🗑️ Excluir' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function excluirIntercessaoInscricao(id, nome) {
      if (!id) return;
      const confirmou = confirm('Tem certeza que deseja excluir a inscrição de "' + (nome || 'Participante') + '"?');
      if (!confirmou) return;

      try {
        const res = await fetch('/intercessao/api/excluir-inscricao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          fetchIntercessaoInscricoes();
        } else {
          alert(data.message || 'Erro ao excluir inscrição.');
        }
      } catch (err) {
        console.error('Erro ao excluir inscrição de Intercessão:', err);
        alert('Erro ao conectar com o servidor.');
      }
    }

    async function sincronizarComPlanilhaIntercessao() {
      const btn = document.getElementById('btnSyncPlanilhaIntercessao');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Sincronizando...';
      }
      try {
        const res = await fetch('/intercessao/api/sincronizar', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.ok) {
          alert('✅ Sincronização concluída com sucesso!\\n' + (data.message || (data.total || 0) + ' inscrições sincronizadas.'));
          await fetchIntercessaoInscricoes();
        } else {
          alert('⚠️ Aviso ao sincronizar: ' + (data.message || 'Verifique se a planilha está configurada.'));
        }
      } catch (err) {
        alert('Erro ao sincronizar com a planilha: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText || '🔄 Puxar da Planilha';
        }
      }
    }

    let userIsAdmin = false;
    let userInfoChecked = false;

    async function checkUserInfo() {
      if (userInfoChecked) return;
      try {
        const userRes = await fetch('/secretaria/api/user-info');
        if (userRes.status === 401 || (userRes.redirected && userRes.url && userRes.url.includes('/secretaria/login'))) {
          window.location.href = '/secretaria/login';
          return;
        }
        if (!userRes.ok) return;
        const userJson = await userRes.json();
        userIsAdmin = Boolean(userJson && userJson.ok && userJson.user && userJson.user.role === 'admin');
        const tabAdmin = document.getElementById('btn-tab-admin');
        const tabLideres = document.getElementById('btn-tab-lideres');
        const tabLogs = document.getElementById('btn-tab-logs');
        if (tabAdmin) tabAdmin.style.display = userIsAdmin ? 'block' : 'none';
        if (tabLideres) tabLideres.style.display = userIsAdmin ? 'block' : 'none';
        if (tabLogs) tabLogs.style.display = userIsAdmin ? 'block' : 'none';

        const userBadgeEl = document.getElementById('headerUserBadge');
        if (userBadgeEl) {
          if (userJson.user && userJson.user.pastoral) {
            const avatar = document.getElementById('headerUserAvatar');
            const name = document.getElementById('headerUserName');
            if (avatar) avatar.src = userJson.user.pastoral.foto || '/images/logo.png';
            if (name) name.textContent = userJson.user.pastoral.nome || '';
            userBadgeEl.style.display = 'flex';
          } else {
            userBadgeEl.style.display = 'none';
          }
        }
        userInfoChecked = true;
      } catch (e) {
        console.warn('Erro ao carregar informações do usuário:', e);
      }
    }

    async function refresh() {
      try {
        const res = await fetch('/secretaria/status');

        // Se o servidor retornar 401 ou redirecionar para login, a sessão expirou
        if (res.status === 401 || (res.redirected && res.url && res.url.includes('/secretaria/login'))) {
          window.location.href = '/secretaria/login?message=Sessão expirada ou servidor reiniciado.';
          return;
        }
        if (!res.ok) {
          const statusEl = document.getElementById('status');
          if (statusEl && statusEl.textContent.trim() === 'Carregando...') {
            statusEl.innerHTML = '<strong>Status:</strong> Conectando ao servidor... 🔄';
          }
          return;
        }
        const json = await res.json();

        // Lógica de Status detalhada
        let statusText = 'Desconectado';
        if (json.connected) {
          statusText = 'Conectado ✅';
        } else if (json.authenticated) {
          const perc = (json.loadingPercent !== undefined && json.loadingPercent !== null) ? ' (' + json.loadingPercent + '%)' : '';
          const msg = json.loadingMessage ? ' - ' + json.loadingMessage : '';
          statusText = 'Autenticado! Sincronizando dados com o WhatsApp... 🔄' + perc + msg;
        } else if (json.canceling) {
          statusText = 'Cancelando... 🛑';
        } else if (json.hasQr) {
          statusText = 'QR Code Gerado! Aguardando leitura no celular... 📱';
        } else if (json.generatingQr) {
          statusText = 'Gerando QR Code... ⚙️';
        } else if (json.initializing) {
          statusText = 'Inicializando navegador... ⏳';
        }

        const statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.innerHTML = '<strong>Status:</strong> ' + statusText;
        }

        const headerPill = document.getElementById('headerWhatsappPill');
        const headerText = document.getElementById('headerWhatsappText');
        if (headerPill && headerText) {
          if (json.connected) {
            headerPill.className = 'header-whatsapp-pill';
            headerText.textContent = 'WhatsApp Conectado';
          } else if (json.initializing || json.generatingQr || json.hasQr || json.canceling || json.authenticated) {
            headerPill.className = 'header-whatsapp-pill aguardando';
            headerText.textContent = 'WhatsApp Conectando...';
          } else {
            headerPill.className = 'header-whatsapp-pill desconectado';
            headerText.textContent = 'WhatsApp Desconectado';
          }
        }
        
        const qrEl = document.getElementById('qr');
        if (qrEl) {
          if (json.hasQr && !json.authenticated && !json.connected) {
            qrEl.innerHTML = '<img src="'+json.qrDataUrl+'" alt="QR Code WhatsApp" />';
          } else if (json.authenticated && !json.connected) {
            qrEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #38bdf8; background: rgba(56, 189, 248, 0.08); border-radius: 12px; border: 1px dashed rgba(56, 189, 248, 0.3); margin-top: 15px;"><span style="font-size: 2.2rem;">📲</span><br/><strong style="font-size: 1.05rem; display: block; margin: 8px 0; color: #f3f4f6;">QR Code escaneado com sucesso!</strong>Sincronizando mensagens e conversas com o WhatsApp... Aguarde um instante.</div>';
          } else {
            qrEl.innerHTML = '';
          }
        }

        // Regra de exibição dos botões
        const isWorking = json.initializing || json.generatingQr || json.hasQr || json.canceling || json.authenticated;
        const btnDisconnect = document.getElementById('disconnect');
        const btnCancelQr = document.getElementById('cancelQr');
        const btnRequestQr = document.getElementById('requestQr');
        const resetBtn = document.getElementById('resetSession');

        if (btnDisconnect) btnDisconnect.style.display = json.connected ? 'inline-block' : 'none';
        if (btnCancelQr) btnCancelQr.style.display = isWorking && !json.connected ? 'inline-block' : 'none';
        if (btnRequestQr) btnRequestQr.style.display = !json.connected && !isWorking ? 'inline-block' : 'none';
        if (resetBtn) resetBtn.style.display = !json.connected && !isWorking ? 'inline-block' : 'none';

        const actionMessageEl = document.getElementById('actionMessage');
        if (actionMessageEl && !actionMessageEl.textContent) {
          actionMessageEl.style.display = 'none';
        }

        // Carrega info do usuário paralelamente
        checkUserInfo();

        if (userIsAdmin) {
          fetch('/secretaria/api/logs')
            .then(r => r.ok ? r.json() : Promise.reject('Erro no servidor'))
            .then(logJson => {
              const cont = document.getElementById('logsContainer');
              if (cont && logJson.ok) {
                cont.textContent = logJson.logs;
                cont.scrollTop = cont.scrollHeight;
              }
            })
            .catch(err => console.warn('Erro ao buscar logs'));
        }
      } catch (err) {
        console.log('Aguardando reconexão com o servidor...', err);
        const statusEl = document.getElementById('status');
        if (statusEl && statusEl.textContent.trim() === 'Carregando...') {
          statusEl.innerHTML = '<strong>Status:</strong> Conectando ao servidor... 🔄';
        }
      }
    }

    async function fetchUsers() {
      fetch('/secretaria/api/admin/users')
        .then(r => r.ok ? r.json() : Promise.reject('Erro ao carregar usuários'))
        .then(json => {
          const list = document.getElementById('userList');
          list.innerHTML = '';
          if (json.users) {
            json.users.forEach(u => {
              const li = document.createElement('li');
              const span = document.createElement('span');
              span.textContent = u.username + ' (' + u.role + ')';
              li.appendChild(span);
              if (u.role !== 'admin') {
                const btn = document.createElement('button');
                btn.className = 'danger';
                btn.textContent = 'Excluir';
                btn.addEventListener('click', () => deleteUser(u.username));
                li.appendChild(btn);
              }
              list.appendChild(li);
            });
          }
        })
        .catch(err => console.error(err));
    }

    async function deleteUser(name) {
      if (confirm('Tem certeza que deseja excluir o usuário ' + name + '?')) {
        console.log('Solicitando exclusão do usuário:', name);
        await fetch('/secretaria/api/admin/users/'+encodeURIComponent(name), { method: 'DELETE' });
        fetchUsers();
      }
    }

    function extrairDigitosTelefone(valor) {
      return (valor || '').replace(/\\D/g, '').slice(0, 13);
    }

    // Recebe só dígitos (já extraídos) e monta "+55 (11) 94308-6727".
    function formatarTelefone(digitos) {
      digitos = extrairDigitosTelefone(digitos);
      let resultado = '';
      if (digitos.length > 0) resultado += '+' + digitos.slice(0, 2);
      if (digitos.length > 2) resultado += ' (' + digitos.slice(2, 4);
      if (digitos.length >= 4) resultado += ')';
      if (digitos.length > 4) resultado += ' ' + digitos.slice(4, 9);
      if (digitos.length > 9) resultado += '-' + digitos.slice(9, 13);
      return resultado;
    }

    function digitosAteIndice(valor, indice) {
      return valor.slice(0, indice).replace(/\\D/g, '').length;
    }

    function indiceAposNDigitos(formatado, n) {
      if (n <= 0) return 0;
      let contados = 0;
      for (let i = 0; i < formatado.length; i++) {
        if (/\\d/.test(formatado[i])) {
          contados++;
          if (contados === n) return i + 1;
        }
      }
      return formatado.length;
    }

    // Aplica a máscara +55 (11) 94308-6727 em tempo real (inclusive ao colar),
    // mantendo o cursor na posição certa depois de reformatar. Sem isso, colar
    // ou apagar um caractere de formatação (espaço, parênteses, traço) fazia o
    // campo "travar", já que reformatar do zero sempre produzia o mesmo texto.
    function ativarMascaraTelefone(input) {
      let digitosAnteriores = extrairDigitosTelefone(input.value);

      input.addEventListener('input', (e) => {
        const cursorAntes = input.selectionStart ?? input.value.length;
        let nDigitosAteCursor = digitosAteIndice(input.value, cursorAntes);
        let digitos = extrairDigitosTelefone(input.value);

        const apagando = e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward';
        if (apagando && digitos === digitosAnteriores && digitos.length > 0 && nDigitosAteCursor > 0) {
          // O caractere apagado foi de formatação, não um dígito — remove
          // manualmente o dígito anterior ao cursor.
          digitos = digitos.slice(0, nDigitosAteCursor - 1) + digitos.slice(nDigitosAteCursor);
          nDigitosAteCursor -= 1;
        }

        digitosAnteriores = digitos;
        const formatado = formatarTelefone(digitos);
        input.value = formatado;

        const novoCursor = indiceAposNDigitos(formatado, nDigitosAteCursor);
        input.setSelectionRange(novoCursor, novoCursor);
      });
    }

    ativarMascaraTelefone(document.getElementById('liderTelefone'));
    ativarMascaraTelefone(document.getElementById('filtroLiderTelefone'));

    let liderEmEdicao = null; // telefone (normalizado) do líder sendo editado, ou null quando é um cadastro novo
    let lideresCache = []; // última lista carregada do servidor

    // Remove acentos para a busca por nome encontrar "joao" mesmo quando o líder está cadastrado como "João"
    function normalizarBusca(texto) {
      return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function renderLideres() {
      const filtroNome = normalizarBusca(document.getElementById('filtroLiderNome').value);
      const filtroTelefone = document.getElementById('filtroLiderTelefone').value.replace(/\D/g, '');

      const filtrados = lideresCache.filter(l => {
        const cargosStr = Array.isArray(l.cargos) ? l.cargos.join(' ') : (l.cargos || '');
        const deptoStr = Array.isArray(l.departamentos) ? l.departamentos.join(' ') : (l.departamento || '');
        const nomeOk = !filtroNome || normalizarBusca(l.nome).includes(filtroNome) || normalizarBusca(cargosStr).includes(filtroNome) || normalizarBusca(deptoStr).includes(filtroNome);
        const telefoneOk = !filtroTelefone || l.telefone.includes(filtroTelefone);
        return nomeOk && telefoneOk;
      });

      const contadorEl = document.getElementById('lideresContador');
      if (contadorEl) {
        if (lideresCache.length === 0) {
          contadorEl.textContent = 'Nenhum usuário cadastrado';
        } else if (filtrados.length === lideresCache.length) {
          contadorEl.textContent = lideresCache.length + ' usuário(s) cadastrado(s)';
        } else {
          contadorEl.textContent = 'Exibindo ' + filtrados.length + ' de ' + lideresCache.length + ' usuário(s)';
        }
      }

      const list = document.getElementById('liderList');
      list.innerHTML = '';

      if (filtrados.length === 0) {
        const li = document.createElement('li');
        li.className = 'lider-card';
        li.style.textAlign = 'center';
        li.style.color = 'var(--cor-texto-mutado)';
        li.style.padding = '24px';
        li.textContent = lideresCache.length === 0 ? 'Nenhum usuário cadastrado ainda.' : 'Nenhum usuário encontrado com esse filtro.';
        list.appendChild(li);
        return;
      }

      filtrados.forEach(l => {
        const emEdicao = liderEmEdicao === l.telefone;
        const li = document.createElement('li');
        li.className = 'lider-card' + (emEdicao ? ' card-em-edicao' : '');

        // TOPO: Identificação e Ações
        const topo = document.createElement('div');
        topo.className = 'lider-card-topo';

        const ident = document.createElement('div');
        ident.className = 'lider-card-identificacao';

        const nomeWrap = document.createElement('div');
        nomeWrap.className = 'lider-card-nome-wrap';

        const nomeEl = document.createElement('span');
        nomeEl.className = 'lider-card-nome';
        nomeEl.textContent = l.nome || '(sem nome)';
        nomeWrap.appendChild(nomeEl);

        if (emEdicao) {
          const badgeEdit = document.createElement('span');
          badgeEdit.className = 'badge-modo-edicao';
          badgeEdit.textContent = '✏️ Editando Agora';
          nomeWrap.appendChild(badgeEdit);
        }

        ident.appendChild(nomeWrap);

        const meta = document.createElement('div');
        meta.className = 'lider-card-meta';

        const telSpan = document.createElement('span');
        telSpan.className = 'meta-tel';
        telSpan.textContent = '📱 ' + formatarTelefone(l.telefone);
        meta.appendChild(telSpan);

        if (l.dataNascimento) {
          const badgeNasc = document.createElement('span');
          badgeNasc.className = 'badge-aniversario';
          badgeNasc.textContent = '🎂 ' + l.dataNascimento;
          meta.appendChild(badgeNasc);
        }

        ident.appendChild(meta);
        topo.appendChild(ident);

        const acoes = document.createElement('div');
        acoes.className = 'lider-card-acoes';

        const btnEditar = document.createElement('button');
        btnEditar.type = 'button';
        btnEditar.className = 'btn-card-edit';
        btnEditar.innerHTML = '✏️ Editar';
        btnEditar.addEventListener('click', () => iniciarEdicaoLider(l));
        acoes.appendChild(btnEditar);

        const btnRemover = document.createElement('button');
        btnRemover.type = 'button';
        btnRemover.className = 'btn-card-delete';
        btnRemover.title = 'Remover Usuário';
        btnRemover.textContent = '🗑️';
        btnRemover.addEventListener('click', () => deleteLider(l.telefone));
        acoes.appendChild(btnRemover);

        topo.appendChild(acoes);
        li.appendChild(topo);

        // DETALHES: Linha de Cargos e Linha de Departamentos
        const detalhes = document.createElement('div');
        detalhes.className = 'lider-card-detalhes';

        // Linha de Cargos
        const linhaCargos = document.createElement('div');
        linhaCargos.className = 'lider-detalhe-linha';

        const rotuloCargos = document.createElement('span');
        rotuloCargos.className = 'lider-detalhe-rotulo';
        rotuloCargos.textContent = 'Cargos:';
        linhaCargos.appendChild(rotuloCargos);

        const tagsCargos = document.createElement('div');
        tagsCargos.className = 'lider-detalhe-tags';
        const cargos = Array.isArray(l.cargos) && l.cargos.length > 0 ? l.cargos : ['lider'];
        cargos.forEach(c => {
          const badge = document.createElement('span');
          badge.className = 'badge badge-' + c.toLowerCase();
          const nomeCargo = c.charAt(0).toUpperCase() + c.slice(1);
          badge.textContent = nomeCargo === 'Lider' ? 'Líder' : nomeCargo;
          tagsCargos.appendChild(badge);
        });
        linhaCargos.appendChild(tagsCargos);
        detalhes.appendChild(linhaCargos);

        // Linha de Ministérios
        const linhaDeptos = document.createElement('div');
        linhaDeptos.className = 'lider-detalhe-linha';

        const rotuloDeptos = document.createElement('span');
        rotuloDeptos.className = 'lider-detalhe-rotulo';
        rotuloDeptos.textContent = 'Ministérios:';
        linhaDeptos.appendChild(rotuloDeptos);

        const tagsDeptos = document.createElement('div');
        tagsDeptos.className = 'lider-detalhe-tags';
        const deptosList = Array.isArray(l.departamentos) && l.departamentos.length > 0
          ? l.departamentos
          : (l.departamento ? (typeof l.departamento === 'string' ? l.departamento.split(',').map(d => d.trim()).filter(Boolean) : [l.departamento]) : []);

        if (deptosList.length === 0) {
          const vazio = document.createElement('span');
          vazio.className = 'lider-detalhe-vazio';
          vazio.textContent = 'Nenhum ministério vinculado';
          tagsDeptos.appendChild(vazio);
        } else {
          const ICONES_MAP = {
            'Rede Kids': '/images/icon-kids.png',
            'Rede Ruach': '/images/icon-ruach.png',
            'Rede de Casais': '/images/icon-casais.png',
            'Rede de Homens': '/images/icon-homens.png',
            'Rede de Mulheres': '/images/icon-mulheres.png',
            'Epifania': '/images/icon-epifania.png',
            'Departamento de Artes': '/images/icon-artes.png',
            'Evangelismo': '/images/icon-evangelismo.png',
            'Intercessão': '/images/icon-intercessao.png',
            'Projeto Social Seeds': '/images/icon-seeds.png'
          };
          deptosList.forEach(depto => {
            const badgeDepto = document.createElement('span');
            badgeDepto.className = 'badge badge-depto';
            badgeDepto.style.display = 'inline-flex';
            badgeDepto.style.alignItems = 'center';
            badgeDepto.style.gap = '5px';
            const iconUrl = ICONES_MAP[depto];
            if (iconUrl) {
              const img = document.createElement('img');
              img.src = iconUrl;
              img.alt = '';
              img.style.width = '14px';
              img.style.height = '14px';
              img.style.objectFit = 'contain';
              badgeDepto.appendChild(img);
            }
            const txt = document.createTextNode(depto);
            badgeDepto.appendChild(txt);
            tagsDeptos.appendChild(badgeDepto);
          });
        }
        linhaDeptos.appendChild(tagsDeptos);
        detalhes.appendChild(linhaDeptos);

        li.appendChild(detalhes);
        list.appendChild(li);
      });
    }

    document.getElementById('filtroLiderNome').addEventListener('input', renderLideres);
    document.getElementById('filtroLiderTelefone').addEventListener('input', renderLideres);

    async function fetchLideres() {
      fetch('/secretaria/api/admin/lideres')
        .then(r => r.ok ? r.json() : Promise.reject('Erro ao carregar líderes'))
        .then(json => {
          lideresCache = json.lideres || [];
          renderLideres();
        })
        .catch(err => console.error(err));
    }

    async function deleteLider(telefone) {
      if (confirm('Tem certeza que deseja remover o usuário ' + telefone + '?')) {
        console.log('Solicitando remoção do usuário:', telefone);
        await fetch('/secretaria/api/admin/lideres/'+encodeURIComponent(telefone), { method: 'DELETE' });
        if (liderEmEdicao === telefone) cancelarEdicaoLider();
        fetchLideres();
      }
    }

    function iniciarEdicaoLider(lider) {
      liderEmEdicao = lider.telefone;
      const form = document.getElementById('addLiderForm');
      form.nome.value = lider.nome;
      form.telefone.value = formatarTelefone(lider.telefone);
      if (form.dataNascimento) form.dataNascimento.value = lider.dataNascimento || '';
      
      const deptos = Array.isArray(lider.departamentos)
        ? lider.departamentos
        : (lider.departamento ? String(lider.departamento).split(',').map(d => d.trim()).filter(Boolean) : []);
      form.querySelectorAll('input[name="departamentos"]').forEach(cb => {
        cb.checked = deptos.includes(cb.value);
      });
      
      const cargos = Array.isArray(lider.cargos) ? lider.cargos : (lider.cargos ? [lider.cargos] : ['lider']);
      form.querySelectorAll('input[name="cargos"]').forEach(cb => {
        cb.checked = cargos.includes(cb.value);
      });

      document.getElementById('liderFormTitle').textContent = 'Editar Usuário / Cargo';
      document.getElementById('liderSubmitBtn').textContent = 'Salvar Alterações';
      document.getElementById('cancelarEdicaoLider').style.display = 'inline-block';

      const badgeModo = document.getElementById('badgeModoEdicao');
      if (badgeModo) {
        badgeModo.style.display = 'inline-block';
        badgeModo.textContent = '✏️ Editando: ' + (lider.nome || '').split(' ')[0];
      }

      const formCard = document.getElementById('liderFormCard');
      if (formCard) {
        formCard.classList.remove('editando-destaque');
        void formCard.offsetWidth; // Dispara reflow para reiniciar animação
        formCard.classList.add('editando-destaque');
        formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      if (form.nome) form.nome.focus();

      renderLideres();
    }

    function cancelarEdicaoLider() {
      liderEmEdicao = null;
      const form = document.getElementById('addLiderForm');
      form.reset();
      if (form.dataNascimento) form.dataNascimento.value = '';
      form.querySelectorAll('input[name="departamentos"]').forEach(cb => {
        cb.checked = false;
      });
      form.querySelectorAll('input[name="cargos"]').forEach(cb => {
        cb.checked = (cb.value === 'lider');
      });
      document.getElementById('liderFormTitle').textContent = 'Novo Usuário / Cargo';
      document.getElementById('liderSubmitBtn').textContent = 'Adicionar';
      document.getElementById('cancelarEdicaoLider').style.display = 'none';

      const badgeModo = document.getElementById('badgeModoEdicao');
      if (badgeModo) badgeModo.style.display = 'none';

      const formCard = document.getElementById('liderFormCard');
      if (formCard) formCard.classList.remove('editando-destaque');

      renderLideres();
    }

    function focarNovoUsuario() {
      cancelarEdicaoLider();
      const formCard = document.getElementById('liderFormCard');
      if (formCard) {
        formCard.classList.remove('editando-destaque');
        void formCard.offsetWidth;
        formCard.classList.add('editando-destaque');
        formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      const form = document.getElementById('addLiderForm');
      if (form && form.nome) form.nome.focus();
    }

    document.getElementById('cancelarEdicaoLider').addEventListener('click', cancelarEdicaoLider);
    const btnNovoTopo = document.getElementById('btnNovoLiderTopo');
    if (btnNovoTopo) btnNovoTopo.addEventListener('click', focarNovoUsuario);

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      console.log('Tentando adicionar novo usuário:', data.username);
      const res = await fetch('/secretaria/api/admin/users', {
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
        msgEl.style.backgroundColor = 'rgba(22, 163, 74, 0.2)';
        msgEl.style.color = '#86efac';
        e.target.reset();
        fetchUsers();
      } else {
        console.error('Erro ao criar usuário:', json.message);
        msgEl.style.backgroundColor = 'rgba(220, 38, 38, 0.2)';
        msgEl.style.color = '#fca5a5';
      }
    });

    document.getElementById('addLiderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      
      const checkedBoxes = Array.from(form.querySelectorAll('input[name="cargos"]:checked')).map(cb => cb.value);
      if (checkedBoxes.length === 0) {
        const msgEl = document.getElementById('lideresMessage');
        msgEl.style.display = 'block';
        msgEl.textContent = 'Selecione ao menos uma permissão / cargo.';
        msgEl.style.backgroundColor = 'rgba(220, 38, 38, 0.2)';
        msgEl.style.color = '#fca5a5';
        return;
      }
      data.cargos = checkedBoxes;

      const checkedDeptos = Array.from(form.querySelectorAll('input[name="departamentos"]:checked')).map(cb => cb.value);
      data.departamentos = checkedDeptos;

      const editando = !!liderEmEdicao;
      const url = editando ? '/secretaria/api/admin/lideres/' + encodeURIComponent(liderEmEdicao) : '/secretaria/api/admin/lideres';
      const method = editando ? 'PUT' : 'POST';
      console.log((editando ? 'Editando usuário:' : 'Tentando adicionar novo usuário:'), data.nome);
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      const msgEl = document.getElementById('lideresMessage');
      msgEl.style.display = 'block';
      msgEl.textContent = json.message;

      if (res.ok) {
        console.log(editando ? 'Usuário atualizado com sucesso.' : 'Usuário adicionado com sucesso.');
        msgEl.style.backgroundColor = 'rgba(22, 163, 74, 0.2)';
        msgEl.style.color = '#86efac';
        cancelarEdicaoLider();
        fetchLideres();
      } else {
        console.error((editando ? 'Erro ao editar usuário:' : 'Erro ao adicionar usuário:'), json.message);
        msgEl.style.backgroundColor = 'rgba(220, 38, 38, 0.2)';
        msgEl.style.color = '#fca5a5';
      }
    });

    document.getElementById('requestQr').onclick = () => {
      console.log('Botão: Solicitar QR Code');
      fetch('/secretaria/request-qr', {method:'POST'}).then(refresh);
    };
    document.getElementById('cancelQr').onclick = () => {
      console.log('Botão: Cancelar QR Code');
      fetch('/secretaria/cancel-qr', {method:'POST'}).then(refresh);
    };
    document.getElementById('disconnect').onclick = () => {
      if(confirm('Desconectar o WhatsApp?')) {
        console.log('Botão: Desconectar');
        fetch('/secretaria/disconnect', {method:'POST'}).then(refresh);
      }
    };
    const resetBtnEl = document.getElementById('resetSession');
    if (resetBtnEl) {
      resetBtnEl.onclick = () => {
        if(confirm('Deseja limpar todos os dados da sessão antiga e gerar um QR Code 100% limpo?')) {
          console.log('Botão: Resetar Conexão');
          fetch('/secretaria/reset-session', {method:'POST'}).then(refresh);
        }
      };
    }
    document.getElementById('logout').onclick = () => {
      console.log('Encerrando sessão...');
      fetch('/secretaria/logout', {method:'POST'}).then(() => window.location.href='/secretaria/login');
    };

    document.getElementById('clearLogsBtn').onclick = async () => {
      if (!confirm('Tem certeza que deseja limpar todos os logs?')) return;
      console.log('Solicitando limpeza de logs...');
      const res = await fetch('/secretaria/api/logs', { method: 'DELETE' });
      if (res.ok) {
        console.log('Logs limpos com sucesso.');
        refresh();
      } else {
        console.error('Erro ao limpar logs.');
      }
    };

    function removerEventosPassadosSecretaria() {
      try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        document.querySelectorAll('.evento-card-item[data-event-date]').forEach(el => {
          const raw = el.getAttribute('data-event-date');
          if (raw) {
            const partes = raw.split('-');
            if (partes.length === 3) {
              const dataEv = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10), 23, 59, 59);
              if (!isNaN(dataEv.getTime()) && dataEv < hoje) {
                el.remove();
              }
            }
          }
        });
      } catch (_) {}
    }

    setInterval(refresh, 5000);
    refresh();
    fetchEventosPainel();
    fetchEventosCadastrados();
    if (document.getElementById('gaveta-mulheres')) fetchMulheresInscricoes();
    if (document.getElementById('gaveta-saude_mulher')) fetchSaudeMulherInscricoes();
    if (document.getElementById('gaveta-intercessao')) fetchIntercessaoInscricoes();
    removerEventosPassadosSecretaria();
    restaurarEstadoGavetas();
  </script>
</body></html>`;
}

module.exports = { renderLoginHtml, renderRegisterHtml, renderIndexHtml };