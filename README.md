# AdGuard Home Exporter

[![Docker Hub](https://img.shields.io/docker/pulls/jonanek/adguardhome-exporter.svg)](https://hub.docker.com/r/jonanek/adguardhome-exporter)

Prometheus exporter for monitoring AdGuard Home instances. Supports monitoring multiple servers simultaneously.

## Monitoring Multiple AdGuard Servers

If you want to monitor **multiple AdGuard instances at once**, simply provide comma-separated (`,`) values for all three required variables:

```
ADGUARD_URLS=192.168.0.8,192.168.0.9
ADGUARD_USERNAMES=Admin,Admin
ADGUARD_PASSWORDS=Password1,Password2
```

⚠️ **Important:** The number of items in all three variables must match (first URL corresponds to first username and first password, etc.)

## Enviroment variables

| Variable | Required | Default Value | Examples |
| --- | --- | --- | --- |
| ADGUARD_URLS | ✅ | - | `192.168.0.8` or `https://192.168.0.8` or `192.168.0.8,192.168.0.9` |
| ADGUARD_USERNAMES | ✅ | - | `Admin` or `Admin,Admin` |
| ADGUARD_PASSWORDS | ✅ | - | `MyPassword` or `MyPassword,SecondPassword` |
| SCRAPE_INTERVAL_SECONDS | ❌ | `30` | `15` |
| PORT | ❌ | `9100` | `8080` |

(If using https specify https in urls)

## Run in Docker
```bash
docker run -d --restart unless-stopped --name adguard-exporter -e ADGUARD_URLS=192.168.0.8,192.168.0.9 -e ADGUARD_USERNAMES=Admin,Admin -e ADGUARD_PASSWORDS=MyBestPassword,MySecondBestPassword -p 9100:9100 jonanek/adguardhome-exporter
```


## Prometheus Configuration

Add the following job to your `prometheus.yml` file:

```yaml
scrape_configs:
  - job_name: 'adguardhome'
    static_configs:
      - targets: ['127.0.0.1:9100']  # or the IP address of the host running the exporter
```
