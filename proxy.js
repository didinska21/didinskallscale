const fs = require("fs");

function parseProxy(proxy) {
  // support:
  // ip:port
  // user:pass@ip:port
  return proxy.includes("@")
    ? `http://${proxy}`
    : `http://${proxy}`;
}

function loadProxy(type = "static") {
  if (!fs.existsSync("proxy.txt")) return null;

  const proxies = fs
    .readFileSync("proxy.txt", "utf-8")
    .split("\n")
    .map(p => p.trim())
    .filter(Boolean);

  if (!proxies.length) return null;

  if (type === "rotating") {
    const random = proxies[Math.floor(Math.random() * proxies.length)];
    return parseProxy(random);
  }

  return parseProxy(proxies[0]); // static
}

module.exports = { loadProxy };
