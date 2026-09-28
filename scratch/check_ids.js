const { renderIndexHtml } = require('../web/views');
const html = renderIndexHtml();
const jsMatches = [...html.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const missing = [];
for (const id of new Set(jsMatches)) {
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missing.push(id);
  }
}
console.log('Total getElementById searched:', jsMatches.length);
console.log('Unique IDs:', new Set(jsMatches).size);
console.log('Missing IDs:', missing);
