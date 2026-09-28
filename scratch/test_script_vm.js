const { renderIndexHtml } = require('../web/views');
const html = renderIndexHtml();
const scriptContent = html.substring(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

const vm = require('vm');

const elements = {};
function mockElement(tag, id = '') {
  return {
    tagName: tag,
    id: id,
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    appendChild: () => {},
    innerHTML: 'Carregando...',
    textContent: 'Carregando...',
    value: '',
    dataset: {},
    focus: () => {},
    reset: () => {},
    querySelector: () => mockElement('div'),
    querySelectorAll: () => [],
    closest: () => mockElement('div')
  };
}

const idRegex = /id=["']([^"']+)["']/g;
let match;
while ((match = idRegex.exec(html)) !== null) {
  elements[match[1]] = mockElement('div', match[1]);
}

const documentMock = {
  getElementById: (id) => elements[id] || null,
  querySelectorAll: (selector) => [],
  createElement: (tag) => mockElement(tag)
};

const windowMock = {
  location: { href: '', search: '' },
  setInterval: (fn, ms) => {},
  setTimeout: (fn, ms) => {},
  fetch: async (url, opts) => {
    if (url === '/secretaria/status') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ connected: false, initializing: false, generatingQr: false, hasQr: false })
      };
    }
    if (url === '/secretaria/api/user-info') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, user: { username: 'admin', role: 'admin' } })
      };
    }
    if (url === '/the-chosen/api/inscritos') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, inscricoes: [] })
      };
    }
    if (url === '/secretaria/api/eventos') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, eventos: [] })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  },
  alert: (msg) => console.log('[Alert]', msg),
  confirm: (msg) => true,
  prompt: (msg) => null,
  document: documentMock
};

const context = vm.createContext({
  window: windowMock,
  document: documentMock,
  fetch: windowMock.fetch,
  setInterval: windowMock.setInterval,
  setTimeout: windowMock.setTimeout,
  console: console,
  FormData: class { constructor() {} },
  URLSearchParams: class { constructor() { return { get: () => null }; } }
});

(async () => {
  try {
    vm.runInContext(scriptContent, context);
    // wait a tick for promises
    await new Promise(r => setTimeout(r, 100));
    console.log('Final Status element innerHTML:', elements['status']?.innerHTML);
    console.log('Request QR button display:', elements['requestQr']?.style?.display);
    console.log('Admin tab display:', elements['btn-tab-admin']?.style?.display);
  } catch (e) {
    console.error('ERROR during script execution:', e);
  }
})();
