import { config } from './config'
import * as http from 'http';
import { register, fetch } from './metrics';
import { AdGuardServer } from './types';

const adguardServers: AdGuardServer[] = [];

for (const [i, url] of config.adGuardUrls.entries()) {
    adguardServers.push({
        url: url,
        username: config.adGuardUsernames[i]!,
        password: config.adGuardPasswords[i]!,
    });
}

const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(await register.metrics());
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - Not Found');
    }
});

server.listen(config.port, async () => {
    console.log(`Exporter listening on port ${config.port}`);
});

// Start fetch
fetch(adguardServers);

// Schedule periodic fetch
setInterval(async () => {
    await fetch(adguardServers);
}, config.scrapeIntervalSeconds * 1000);
