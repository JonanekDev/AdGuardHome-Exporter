import { config } from "./config";
import * as http from "http";
import { register, fetch } from "./metrics";
import { AdGuardServer } from "./types";

const adguardServers: AdGuardServer[] = [];

for (const [i, url] of config.adGuardUrls.entries()) {
  adguardServers.push({
    url: url,
    username: config.adGuardUsernames[i]!,
    password: config.adGuardPasswords[i]!,
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/metrics") {
    console.log(`[${new Date().toISOString()}] /metrics endpoint requested`);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(await register.metrics());
  } else {
    console.log(`[${new Date().toISOString()}] 404 - Not Found: ${req.url}`);
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 - Not Found");
  }
});

server.listen(config.port, async () => {
  console.log(`Exporter listening on port ${config.port}`);
  console.log(`Scrape interval: ${config.scrapeIntervalSeconds} seconds`);
  console.log(`AdGuard servers configured: ${config.adGuardUrls.join(", ")}`);
});

// Start fetch
console.log(`[${new Date().toISOString()}] Starting initial fetch from AdGuard servers...`);
fetch(adguardServers);

// Schedule periodic fetch
setInterval(async () => {
  console.log(`[${new Date().toISOString()}] Starting periodic fetch from AdGuard servers...`);
  await fetch(adguardServers);
}, config.scrapeIntervalSeconds * 1000);
