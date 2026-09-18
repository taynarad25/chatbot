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

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const res = await fetch('/secretaria/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      if (res.ok) {
        console.log('Login bem-sucedido.');
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
      max-width: 980px;
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
    @media (max-width: 600px) {
      .header-painel { flex-direction: column; align-items: flex-start; gap: 14px; }
      .filtros-lideres { flex-direction: column; gap: 0; }
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
      <button id="logout">Sair do Painel</button>
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="openTab(event, 'tab-whatsapp')">WhatsApp</button>
      <button class="tab-btn" id="btn-tab-admin" style="display:none;" onclick="openTab(event, 'tab-admin')">Perfil de Acesso</button>
      <button class="tab-btn" id="btn-tab-lideres" style="display:none;" onclick="openTab(event, 'tab-lideres')">Usuários & Cargos</button>
      <button class="tab-btn" id="btn-tab-logs" style="display:none;" onclick="openTab(event, 'tab-logs')">Logs</button>
    </div>
    
    <div id="tab-whatsapp" class="tab-content active">
      <div id="status">Carregando...</div>
      <div id="actionMessage" style="color: var(--cor-ciano); margin: 0.5rem 0; font-weight:600;"></div>
      <div id="qr"></div>
      <div>
        <button class="primary" id="requestQr" style="display:none">Solicitar QR Code</button>
        <button id="cancelQr" style="display:none">Cancelar QR Code</button>
        <button class="danger" id="disconnect" style="display:none">Desconectar WhatsApp</button>
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
      <h3 class="section-title-tab">Gestão de Usuários & Cargos</h3>
      <div class="filtros-lideres">
        <input id="filtroLiderNome" placeholder="🔍 Buscar por nome, cargo ou departamento" />
        <input id="filtroLiderTelefone" placeholder="📱 Buscar por telefone" inputmode="numeric" autocomplete="off" />
      </div>
      <ul id="liderList"></ul>
      <hr>
      <h4 id="liderFormTitle" style="font-size: 1.1rem; color: #ffffff; margin-bottom: 0.75rem;">Novo Usuário / Cargo</h4>
      <div id="lideresMessage" class="message-box" style="display:none;"></div>
      <form id="addLiderForm">
        <input name="nome" placeholder="Nome completo" required />
        <input id="liderTelefone" name="telefone" placeholder="Ex: +55 (11) 94308-6727" inputmode="numeric" maxlength="19" autocomplete="off" required />
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size: 0.85rem; color: #a1a1aa; margin-bottom: 5px;">Departamento / Ministério:</label>
          <select name="departamento" id="liderDepartamento" style="width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #ffffff; font-size: 0.95rem;">
            <option value="" style="background: #18181b; color: #ffffff;">Nenhum / Geral</option>
            <option value="Evangelismo" style="background: #18181b; color: #ffffff;">Evangelismo</option>
            <option value="Epifania" style="background: #18181b; color: #ffffff;">Epifania</option>
            <option value="Intercessão" style="background: #18181b; color: #ffffff;">Intercessão</option>
            <option value="Projeto Social Seeds" style="background: #18181b; color: #ffffff;">Projeto Social Seeds</option>
            <option value="Rede Ruach" style="background: #18181b; color: #ffffff;">Rede Ruach</option>
            <option value="Rede de Casais" style="background: #18181b; color: #ffffff;">Rede de Casais</option>
            <option value="Rede de Homens" style="background: #18181b; color: #ffffff;">Rede de Homens</option>
            <option value="Rede de Mulheres" style="background: #18181b; color: #ffffff;">Rede de Mulheres</option>
            <option value="Rede Kids" style="background: #18181b; color: #ffffff;">Rede Kids</option>
            <option value="Eventos Externos" style="background: #18181b; color: #ffffff;">Eventos Externos</option>
            <option value="Outros" style="background: #18181b; color: #ffffff;">Outros</option>
          </select>
        </div>
        <div class="cargos-container">
          <span class="cargos-title">Cargos / Permissões Ministeriais:</span>
          <div class="cargos-checkboxes">
            <label><input type="checkbox" name="cargos" value="lider" checked /> Líder</label>
            <label><input type="checkbox" name="cargos" value="pastor" /> Pastor</label>
            <label><input type="checkbox" name="cargos" value="diretor" /> Diretor</label>
            <label><input type="checkbox" name="cargos" value="membro" /> Membro</label>
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="submit" id="liderSubmitBtn" class="primary">Adicionar</button>
          <button type="button" id="cancelarEdicaoLider" style="display:none;">Cancelar</button>
        </div>
      </form>
    </div>

    <div id="tab-logs" class="tab-content">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 class="section-title-tab" style="margin:0;">Logs do Sistema</h3>
        <button class="danger" id="clearLogsBtn" style="padding: 6px 14px; font-size: 0.82rem; width: auto;">Limpar Logs</button>
      </div>
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
      if(name === 'tab-lideres') fetchLideres();
    }

    async function refresh() {
      try {
        const res = await fetch('/secretaria/status');

        // Se o servidor retornar 401, a sessão expirou ou o servidor reiniciou (limpando a memória)
        if (res.status === 401) {
          window.location.href = '/secretaria/login?message=Sessão expirada ou servidor reiniciado.';
          return;
        }
        if (!res.ok) return;
        const json = await res.json();

        const userRes = await fetch('/secretaria/api/user-info');
        if (userRes.status === 401) { window.location.href = '/secretaria/login'; return; }
        const userJson = await userRes.json();
        const isAdmin = userJson.ok && userJson.user.role === 'admin';
        document.getElementById('btn-tab-admin').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('btn-tab-lideres').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('btn-tab-logs').style.display = isAdmin ? 'block' : 'none';

      const actionMessageEl = document.getElementById('actionMessage');
      actionMessageEl.style.display = 'none'; // Hide previous action messages

      // Lógica de Status detalhada
      let statusText = 'Desconectado';
      if (json.connected) statusText = 'Conectado ✅';
      else if (json.canceling) statusText = 'Cancelando... 🛑';
      else if (json.hasQr) statusText = 'QR Code Gerado! Aguardando leitura... 📱';
      else if (json.generatingQr) statusText = 'Gerando QR Code... ⚙️';
      else if (json.initializing) statusText = 'Inicializando... ⏳';

      document.getElementById('status').innerHTML = '<strong>Status:</strong> ' + statusText;
      
      if (json.hasQr) document.getElementById('qr').innerHTML = '<img src="'+json.qrDataUrl+'" />';
      else document.getElementById('qr').innerHTML = '';

      // Regra de exibição dos botões
      const isWorking = json.initializing || json.generatingQr || json.hasQr || json.canceling;
      document.getElementById('disconnect').style.display = json.connected ? 'inline-block' : 'none';
      document.getElementById('cancelQr').style.display = isWorking && !json.connected ? 'inline-block' : 'none';
      document.getElementById('requestQr').style.display = !json.connected && !isWorking ? 'inline-block' : 'none';

      if (isAdmin) {
        fetch('/secretaria/api/logs')
          .then(r => r.ok ? r.json() : Promise.reject('Erro no servidor'))
          .then(json => {
            const cont = document.getElementById('logsContainer');
            if (json.ok) {
              cont.textContent = json.logs;
              cont.scrollTop = cont.scrollHeight;
            }
          })
          .catch(err => console.warn('Erro ao buscar logs (sessão pode ter expirado)'));
      }
      } catch (err) {
        console.log('Aguardando reconexão com o servidor...');
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
      return (texto || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    }

    function renderLideres() {
      const filtroNome = normalizarBusca(document.getElementById('filtroLiderNome').value);
      const filtroTelefone = document.getElementById('filtroLiderTelefone').value.replace(/\\D/g, '');

      const filtrados = lideresCache.filter(l => {
        const cargosStr = Array.isArray(l.cargos) ? l.cargos.join(' ') : (l.cargos || '');
        const deptoStr = l.departamento || '';
        const nomeOk = !filtroNome || normalizarBusca(l.nome).includes(filtroNome) || normalizarBusca(cargosStr).includes(filtroNome) || normalizarBusca(deptoStr).includes(filtroNome);
        const telefoneOk = !filtroTelefone || l.telefone.includes(filtroTelefone);
        return nomeOk && telefoneOk;
      });

      const list = document.getElementById('liderList');
      list.innerHTML = '';

      if (filtrados.length === 0) {
        const li = document.createElement('li');
        li.textContent = lideresCache.length === 0 ? 'Nenhum usuário cadastrado.' : 'Nenhum usuário encontrado com esse filtro.';
        list.appendChild(li);
        return;
      }

      filtrados.forEach(l => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = (l.nome || '(sem nome)') + ' | ' + formatarTelefone(l.telefone) + ' ';

        const cargos = Array.isArray(l.cargos) && l.cargos.length > 0 ? l.cargos : ['lider'];
        cargos.forEach(c => {
          const badge = document.createElement('span');
          badge.className = 'badge badge-' + c.toLowerCase();
          const nomeCargo = c.charAt(0).toUpperCase() + c.slice(1);
          badge.textContent = nomeCargo === 'Lider' ? 'Líder' : nomeCargo;
          span.appendChild(badge);
        });

        if (l.departamento) {
          const badgeDepto = document.createElement('span');
          badgeDepto.className = 'badge badge-depto';
          badgeDepto.textContent = l.departamento;
          span.appendChild(badgeDepto);
        }

        li.appendChild(span);

        // Agrupa os dois botões numa única "coluna" à direita
        const acoes = document.createElement('span');
        acoes.style.display = 'flex';
        acoes.style.gap = '8px';

        const btnEditar = document.createElement('button');
        btnEditar.textContent = 'Editar';
        btnEditar.addEventListener('click', () => iniciarEdicaoLider(l));
        acoes.appendChild(btnEditar);

        const btnRemover = document.createElement('button');
        btnRemover.className = 'danger';
        btnRemover.textContent = 'Remover';
        btnRemover.addEventListener('click', () => deleteLider(l.telefone));
        acoes.appendChild(btnRemover);

        li.appendChild(acoes);

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
      form.departamento.value = lider.departamento || '';
      
      const cargos = Array.isArray(lider.cargos) ? lider.cargos : (lider.cargos ? [lider.cargos] : ['lider']);
      form.querySelectorAll('input[name="cargos"]').forEach(cb => {
        cb.checked = cargos.includes(cb.value);
      });

      document.getElementById('liderFormTitle').textContent = 'Editar Usuário / Cargo';
      document.getElementById('liderSubmitBtn').textContent = 'Salvar';
      document.getElementById('cancelarEdicaoLider').style.display = 'inline-block';
    }

    function cancelarEdicaoLider() {
      liderEmEdicao = null;
      const form = document.getElementById('addLiderForm');
      form.reset();
      form.departamento.value = '';
      form.querySelectorAll('input[name="cargos"]').forEach(cb => {
        cb.checked = (cb.value === 'lider');
      });
      document.getElementById('liderFormTitle').textContent = 'Novo Usuário / Cargo';
      document.getElementById('liderSubmitBtn').textContent = 'Adicionar';
      document.getElementById('cancelarEdicaoLider').style.display = 'none';
    }

    document.getElementById('cancelarEdicaoLider').addEventListener('click', cancelarEdicaoLider);

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

    setInterval(refresh, 5000); refresh();
  </script>
</body></html>`;
}

module.exports = { renderLoginHtml, renderRegisterHtml, renderIndexHtml };