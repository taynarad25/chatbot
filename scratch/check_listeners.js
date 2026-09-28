const { renderIndexHtml } = require('../web/views');
const html = renderIndexHtml();
// extract <script>...</script>
const scriptContent = html.substring(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// Check for top-level getElementById that add event listeners without checking if null
const lines = scriptContent.split('\n');
lines.forEach((line, index) => {
  if (line.includes('document.getElementById') && (line.includes('.addEventListener') || line.includes('.onclick') || line.includes('.onsubmit'))) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
