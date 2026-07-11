const net = require("net");

// Faixas de IP oficiais do Cloudflare (https://www.cloudflare.com/ips/), atualizado em 2026.
// Só requisições que chegam de um desses IPs têm os headers de encaminhamento
// (cf-connecting-ip / x-forwarded-for) confiados — qualquer outra origem (ex: acesso
// direto à porta, contornando o Cloudflare Tunnel) pode forjar esses headers livremente,
// então nesse caso usamos o IP real da conexão TCP em vez deles.
const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const cloudflareBlockList = new net.BlockList();
for (const cidr of CLOUDFLARE_IPV4_RANGES) {
  const [address, prefix] = cidr.split("/");
  cloudflareBlockList.addSubnet(address, Number(prefix), "ipv4");
}
for (const cidr of CLOUDFLARE_IPV6_RANGES) {
  const [address, prefix] = cidr.split("/");
  cloudflareBlockList.addSubnet(address, Number(prefix), "ipv6");
}

// Remove o prefixo IPv4-mapped que o Node usa em sockets dual-stack (ex: "::ffff:192.0.2.1")
function normalizeIp(ip) {
  if (!ip) return ip;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function isTrustedProxyIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (net.isIPv4(normalized)) return cloudflareBlockList.check(normalized, "ipv4");
  if (net.isIPv6(normalized)) return cloudflareBlockList.check(normalized, "ipv6");
  return false;
}

/**
 * Obtém o IP real do cliente. Só confia nos headers de proxy quando a conexão
 * TCP em si vem de um IP do Cloudflare — caso contrário, usa o IP da conexão
 * direta, que não pode ser forjado pelo lado do cliente.
 */
function getClientIp(req) {
  const remoteAddress = normalizeIp(req.socket?.remoteAddress);

  if (!isTrustedProxyIp(remoteAddress)) {
    return remoteAddress;
  }

  const forwardedFor = req.headers["x-forwarded-for"]?.split(",")[0]?.trim();
  return req.headers["cf-connecting-ip"] || forwardedFor || remoteAddress;
}

module.exports = { getClientIp, isTrustedProxyIp, normalizeIp };
