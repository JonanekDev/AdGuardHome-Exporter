# AdGuard Home Exporter

[![Docker Hub](https://img.shields.io/docker/pulls/jonanek/adguardhome-exporter.svg)](https://hub.docker.com/r/jonanek/adguardhome-exporter) 

Prometheus exporter for monitoring AdGuard Home instances. Supports monitoring multiple servers simultaneously.

- [Grafana Dashboard](https://grafana.com/grafana/dashboards/24520-adguard-home-multi-instance-monitoring-prometheus-exporter/)

## Monitoring Multiple AdGuard Servers

There are two ways to configure AdGuard instances:

### Option 1: Indexed Environment Variables (Recommended with Secrets)

Use numbered variables to keep configuration organized. Optionally use the `_FILE` suffix for secure credential handling:

```yaml
ADGUARD_URL_1=http://instance1.net
ADGUARD_USERNAME_FILE_1=/run/secrets/instance1_username
ADGUARD_PASSWORD_FILE_1=/run/secrets/instance1_password

ADGUARD_URL_2=http://instance2.net
ADGUARD_USERNAME_FILE_2=/run/secrets/instance2_username
ADGUARD_PASSWORD_FILE_2=/run/secrets/instance2_password
```

Or without secrets:

```yaml
ADGUARD_URL_1=http://instance1.net
ADGUARD_USERNAME_1=Admin
ADGUARD_PASSWORD_1=MyBestPassword

ADGUARD_URL_2=http://instance2.net
ADGUARD_USERNAME_2=Admin
ADGUARD_PASSWORD_2=MySecondBestPassword
```

### Option 2: Comma-Separated Values

Simple approach for direct values only (no secret file support):

```yaml
ADGUARD_URLS=192.168.0.8,192.168.0.9
ADGUARD_USERNAMES=Admin,Admin
ADGUARD_PASSWORDS=Password1,Password2
```

⚠️ **Important:** The number of items in all three variables must match (first URL corresponds to first username and first password, etc.)

## Environment Variables

### Instance Configuration

#### Indexed variables style:

| Variable                | Required     | Type   | Examples                                             |
| ----------------------- | ------------ | ------ | ---------------------------------------------------- |
| ADGUARD_URL_N           | ✅           | Direct | `http://192.168.0.8` or `https://192.168.0.8`        |
| ADGUARD_USERNAME_N      | ✅ one of    | Direct | `Admin`                                              |
| ADGUARD_USERNAME_FILE_N | these two    | Secret | `/run/secrets/username` (file path to credentials)   |
| ADGUARD_PASSWORD_N      | ✅ one of    | Direct | `MyPassword`                                         |
| ADGUARD_PASSWORD_FILE_N | these two    | Secret | `/run/secrets/password` (file path to credentials)   |

*Where `N` is a number starting at 1, without gaps (1, 2, 3, ...). If both variants are set, the `_FILE` one is used.*

#### Comma-separated values style:

| Variable                | Required | Type   | Examples                                             |
| ----------------------- | -------- | ------ | ---------------------------------------------------- |
| ADGUARD_URLS            | ✅       | Direct | `192.168.0.8,192.168.0.9` (comma-separated)          |
| ADGUARD_USERNAMES       | ✅       | Direct | `Admin,Admin` (comma-separated)                      |
| ADGUARD_PASSWORDS       | ✅       | Direct | `MyPassword,SecondPassword` (comma-separated)        |

### Optional Configuration

| Variable                | Required | Default Value | Allowed   | Examples |
| ----------------------- | -------- | ------------- | --------- | -------- |
| SCRAPE_INTERVAL_SECONDS | ❌       | `30`          | 1 – 3600  | `15`     |
| PORT                    | ❌       | `9100`        | 1 – 65535 | `8080`   |

**Notes:**

- Use `_FILE` suffix for variables pointing to secret files (enables secure credential handling)
- Without a protocol, `http://` is used. For HTTPS, specify `https://` in the URL
- Do not put credentials into the URL, and configure each URL only once
- The comma-separated style does not allow commas in usernames or passwords, use the indexed variables for those
- Choose ONE method: indexed variables OR comma-separated values (not both, however priority is given to indexed vars)
- With an invalid configuration the exporter prints the reason and exits

## Run with Docker Compose

The included `compose.yaml` provides a ready-to-use setup with sample values. Credentials are stored in secret files for security.

Create credential files:
```bash
echo "admin" > instance1_username.txt
echo "password123" > instance1_password.txt
echo "admin" > instance2_username.txt
echo "password456" > instance2_password.txt
```

These files are listed in `.gitignore` and `.dockerignore`. The Docker image copies only secret files referenced by `ADGUARD_*_FILE_N` variables.

Then start the container:
```bash
docker compose up -d
```

## Run with Docker CLI

```bash
docker run -d --restart unless-stopped --name adguard-exporter -e ADGUARD_URLS=192.168.0.8,192.168.0.9 -e ADGUARD_USERNAMES=Admin,Admin -e ADGUARD_PASSWORDS=MyBestPassword,MySecondBestPassword -p 9100:9100 jonanek/adguardhome-exporter
```

## Prometheus Configuration

Add the following job to your `prometheus.yml` file:

```yaml
scrape_configs:
  - job_name: "adguardhome"
    static_configs:
      - targets: ["127.0.0.1:9100"] # or the IP address of the host running the exporter
```

> ⚠️ **Port conflict warning:** Port `9100` is the default port for [Node Exporter](https://github.com/prometheus/node_exporter). If you are running Node Exporter on the same host, you will have a port conflict. In that case, set a different port via the `PORT` environment variable (e.g. `PORT=9617`).

## Metrics

All metrics have an `instance` label with the AdGuard Home URL. With the default Prometheus setting (`honor_labels: false`) it appears as `exported_instance`.

| Metric                                         | Extra label | Description                                                  |
| ---------------------------------------------- | ----------- | ------------------------------------------------------------ |
| `adguard_running`                              |             | AdGuard Home is reachable and its DNS server is running      |
| `adguard_stats_up`                             |             | The last statistics fetch succeeded                          |
| `adguard_protection_enabled`                   |             | Protection is enabled                                        |
| `adguard_protection_disabled_duration_seconds` |             | Seconds remaining until paused protection is enabled again   |
| `adguard_dhcp_available`                       |             | DHCP is available                                            |
| `adguard_dns_queries_total`                    |             | DNS queries                                                  |
| `adguard_blocked_queries_total`                |             | Queries blocked by filtering rules                           |
| `adguard_replaced_safebrowsing_total`          |             | Queries blocked by Safe Browsing                             |
| `adguard_replaced_safesearch_total`            |             | Queries rewritten by Safe Search                             |
| `adguard_replaced_parental_total`              |             | Queries blocked by Parental Control                          |
| `adguard_avg_processing_time_ms`               |             | Average processing time in the current hour                  |
| `adguard_top_queried_domains_total`            | `domain`    | Queries per top queried domain                               |
| `adguard_top_blocked_domains_total`            | `domain`    | Queries per top blocked domain                               |
| `adguard_top_clients_total`                    | `client`    | Queries per top client                                       |
| `adguard_top_upstreams_responses_total`        | `upstream`  | Responses per top upstream                                   |
| `adguard_top_upstreams_avg_time_ms`            | `upstream`  | Average upstream response time in the current hour           |

### How the values are collected

- The exporter reads only the current hour (`/control/stats?recent=3600000`), because the total over the whole retention period is a sliding window and cannot be turned into counters. This needs an AdGuard Home version with the `recent` parameter (tested with `v0.107.78` and `v1.0.0`). Older versions are reported by `adguard_stats_up 0` and an error in the log.
- Counters start at zero when the exporter starts. Queries made between the last scrape and the end of an hour are not counted.
- Top lists in AdGuard Home are limited in size, so the per-domain, per-client and per-upstream counters are approximate.
- Averages cover the current hour, so they move more at the start of an hour. The processing time is not exported for an hour without queries.

## Logs

The exporter logs one line at startup, then only new or changed errors and the recovery from them. Status and statistics are reported separately, so a server going offline usually produces two lines, not two on every scrape.

If AdGuard Home is only reachable through an HTTP proxy, set `NODE_USE_ENV_PROXY=1` together with `HTTP_PROXY` / `HTTPS_PROXY`.

## Development

Requires Node.js 24 or newer.

```bash
npm install
npm test
npm run build
node --env-file=.env dist/index.js   # run the build
node --env-file=.env src/index.ts    # or run the sources directly
```
