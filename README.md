# AdGuard Home Exporter

[![Docker Hub](https://img.shields.io/docker/pulls/jonanek/adguardhome-exporter.svg)](https://hub.docker.com/r/jonanek/adguardhome-exporter) 

Prometheus exporter for monitoring AdGuard Home instances. Supports monitoring multiple servers simultaneously.

- [Grafana Dashboard](https://grafana.com/grafana/dashboards/24520-adguard-home-multi-instance-monitoring-prometheus-exporter/)

## Monitoring Multiple AdGuard Servers

There are three ways to configure multiple AdGuard instances:

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

| Variable                | Required | Type   | Examples                                             |
| ----------------------- | -------- | ------ | ---------------------------------------------------- |
| ADGUARD_URL_N           | ✅       | Direct | `http://192.168.0.8` or `https://192.168.0.8`        |
| ADGUARD_USERNAME_N      | ✅       | Direct | `Admin`                                              |
| ADGUARD_PASSWORD_N      | ✅       | Direct | `MyPassword`                                         |
| ADGUARD_USERNAME_FILE_N | ✅       | Secret | `/run/secrets/username` (file path to credentials)   |
| ADGUARD_PASSWORD_FILE_N | ✅       | Secret | `/run/secrets/password` (file path to credentials)   |

*Where `N` is a number (1, 2, 3, ...)*

#### Comma-separated values style:

| Variable                | Required | Type   | Examples                                             |
| ----------------------- | -------- | ------ | ---------------------------------------------------- |
| ADGUARD_URLS            | ✅       | Direct | `192.168.0.8,192.168.0.9` (comma-separated)          |
| ADGUARD_USERNAMES       | ✅       | Direct | `Admin,Admin` (comma-separated)                      |
| ADGUARD_PASSWORDS       | ✅       | Direct | `MyPassword,SecondPassword` (comma-separated)        |

### Optional Configuration

| Variable                | Required | Default Value | Examples |
| ----------------------- | -------- | ------------- | -------- |
| SCRAPE_INTERVAL_SECONDS | ❌       | `30`          | `15`     |
| PORT                    | ❌       | `9100`        | `8080`   |

**Notes:**

- Use `_FILE` suffix for variables pointing to secret files (enables secure credential handling)
- If using HTTPS, specify `https://` in the URL
- Choose ONE method: indexed variables OR comma-separated values (not both, however priority is given to indexed vars)

## Run with Docker Compose

The included `compose.yaml` provides a ready-to-use setup with sample values. Credentials are stored in secret files for security.

Create credential files:
```bash
echo "admin" > instance1_username.txt
echo "password123" > instance1_password.txt
echo "admin" > instance2_username.txt
echo "password456" > instance2_password.txt
```

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
