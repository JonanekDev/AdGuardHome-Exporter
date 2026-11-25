import { loadConfig, type Config } from "./config.ts";
import * as http from "node:http";
import { register, scrapeAll } from "./metrics.ts";

// As the main process of a container, Node would otherwise ignore SIGTERM.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => process.exit(0));
}

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(`Configuration error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/metrics") {
    res.writeHead(200, { "Content-Type": register.contentType });
    res.end(await register.metrics());
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 - Not Found");
  }
});

server.listen(config.port, () => {
  console.log(
    `Exporter listening on port ${config.port}, scraping ${config.servers.map((s) => s.url).join(", ")} every ${config.scrapeIntervalSeconds} s. Only errors and recoveries are logged from now on.`,
  );
});

// The next scrape is scheduled after the previous one ends, so they never overlap.
async function scrapeLoop() {
  await scrapeAll(config.servers);
  setTimeout(scrapeLoop, config.scrapeIntervalSeconds * 1000);
}
scrapeLoop();
