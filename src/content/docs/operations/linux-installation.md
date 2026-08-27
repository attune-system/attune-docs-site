---
title: "Linux Package Installation"
description: "Attune provides native Linux packages for Debian/Ubuntu (.deb), Fedora/RHEL (.rpm), and Arch Linux (.pkg.tar.zst). Packages are published to the Gitea package registry and can be i"
sidebar:
  label: "Linux Package Installation"
  order: 2
---
Attune provides native Linux packages for Debian/Ubuntu (`.deb`), Fedora/RHEL (`.rpm`), and Arch Linux (`.pkg.tar.zst`). Packages are published to the Gitea package registry and can be installed with your distribution's standard package manager.

## Available Packages

| Package | Contents | Dependencies |
|---------|----------|-------------|
| `attune-api` | API gateway service + systemd unit | glibc ≥ 2.28 |
| `attune-executor` | Execution orchestrator + systemd unit | glibc ≥ 2.28 |
| `attune-notifier` | WebSocket notification service + systemd unit | glibc ≥ 2.28 |
| `attune-cli` | `attune` CLI + `attune-mcp` MCP server | None (static binary) |
| `attune-agent` | `attune-agent` + `attune-sensor-agent` | None (static binary) |

> **Note**: The server packages (`attune-api`, `attune-executor`, `attune-notifier`) require PostgreSQL 16+ with TimescaleDB and RabbitMQ 3.12+ as external services. These are **not** pulled in as package dependencies — install and configure them separately.

## Prerequisites

The server packages depend on PostgreSQL 16 with TimescaleDB and RabbitMQ. Since TimescaleDB and RabbitMQ are not in default OS repositories, add their package sources **before** installing Attune.

### Debian / Ubuntu

```bash
# Add TimescaleDB repository
echo "deb https://packagecloud.io/timescale/timescaledb/debian/ $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/timescaledb.list
curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey | sudo gpg --dearmor -o /etc/apt/keyrings/timescaledb.gpg

# Add RabbitMQ repository (via Cloudsmith)
# See https://www.rabbitmq.com/docs/install-debian for the latest instructions
curl -1sLf 'https://keys.openpgp.org/vks/v1/by-fingerprint/0A9AF2115F4687BD29803A206B73A36E6026DFCA' \
  | sudo gpg --dearmor -o /usr/share/keyrings/com.rabbitmq.team.gpg
echo "deb [signed-by=/usr/share/keyrings/com.rabbitmq.team.gpg] https://ppa1.rabbitmq.com/rabbitmq/rabbitmq-server/deb/ubuntu $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/rabbitmq.list

sudo apt update
```

### Fedora / RHEL

```bash
# Add TimescaleDB repository
sudo tee /etc/yum.repos.d/timescaledb.repo <<EOF
[timescaledb]
name=TimescaleDB
baseurl=https://packagecloud.io/timescale/timescaledb/el/\$releasever/\$basearch
gpgcheck=0
enabled=1
EOF

# Add RabbitMQ repository
# See https://www.rabbitmq.com/docs/install-rpm for the latest instructions
curl -1sLf 'https://packagecloud.io/rabbitmq/rabbitmq-server/gpgkey' | sudo rpm --import -
sudo tee /etc/yum.repos.d/rabbitmq.repo <<EOF
[rabbitmq-server]
name=RabbitMQ Server
baseurl=https://packagecloud.io/rabbitmq/rabbitmq-server/el/\$releasever/\$basearch
gpgcheck=1
enabled=1
EOF
```

### Arch Linux

TimescaleDB is available from the AUR (`timescaledb`). RabbitMQ is in the official `extra` repository.

```bash
# Install an AUR helper if needed (e.g., yay)
yay -S timescaledb
```

## Debian / Ubuntu (apt)

### Add the repository

```bash
# Download the repository signing key
sudo curl -fsSL https://git.rdrx.app/api/packages/attune/debian/repository.key \
  -o /etc/apt/keyrings/attune.asc

# Add the repository
echo "deb [signed-by=/etc/apt/keyrings/attune.asc] https://git.rdrx.app/api/packages/attune/debian stable main" \
  | sudo tee /etc/apt/sources.list.d/attune.list

# Update package index
sudo apt update
```

### Install packages

```bash
# Install all server components
sudo apt install attune-api attune-executor attune-notifier

# Or install just the CLI
sudo apt install attune-cli

# Or install the agent for remote workers
sudo apt install attune-agent
```

## Fedora / RHEL (dnf)

### Add the repository

```bash
sudo dnf config-manager --add-repo \
  https://git.rdrx.app/api/packages/attune/rpm/el9.repo
```

### Install packages

```bash
# Install all server components
sudo dnf install attune-api attune-executor attune-notifier

# Or install just the CLI
sudo dnf install attune-cli

# Or install the agent
sudo dnf install attune-agent
```

## Arch Linux (pacman)

### Add the repository

```bash
# Download and trust the signing key
wget https://git.rdrx.app/api/packages/attune/arch/repository.key
key_id=$(gpg --show-keys repository.key 2>/dev/null | sed -n '2p' | tr -d ' ')
sudo pacman-key --add repository.key
sudo pacman-key --lsign-key "$key_id"
rm repository.key
```

Add to `/etc/pacman.conf`:

```ini
[attune]
SigLevel = Required
Server = https://git.rdrx.app/api/packages/attune/arch/$repo/$arch
```

### Install packages

```bash
sudo pacman -Sy attune-api attune-executor attune-notifier

# Or just the CLI
sudo pacman -Sy attune-cli
```

## Post-Installation Configuration

After installing the server packages, configure the platform before starting services.

### 1. Generate secrets

```bash
# Generate JWT secret and encryption key
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)

# Write to environment file
sudo tee /etc/attune/environment <<EOF
ATTUNE_CONFIG=/etc/attune/attune.yaml
ATTUNE__SECURITY__JWT_SECRET=${JWT_SECRET}
ATTUNE__SECURITY__ENCRYPTION_KEY=${ENCRYPTION_KEY}
RUST_MIN_STACK=67108864
RUST_LOG=info
EOF

sudo chmod 640 /etc/attune/environment
sudo chown root:attune /etc/attune/environment
```

### 2. Configure database and message queue

Edit `/etc/attune/attune.yaml`:

```yaml
database:
  url: "postgresql://attune:your_password@localhost:5432/attune"
  max_connections: 10

message_queue:
  url: "amqp://attune:your_password@localhost:5672/attune"

server:
  host: "0.0.0.0"
  port: 8080

notifier:
  host: "0.0.0.0"
  port: 8081
```

Package upgrades preserve administrator-owned configuration while migrating
legacy configuration during package postinstall: top-level `rabbitmq` becomes
`message_queue`; `JWT_SECRET`, `ENCRYPTION_KEY`, and `ATTUNE__RABBITMQ__URL`
become their current `ATTUNE__...` names. The exact obsolete shipped
`agent.binary_dir`-only block is removed; completed or custom agent settings
and all administrator values are preserved.

### 3. Initialize the database

Create the database and run migrations:

```bash
# Create the PostgreSQL database (adjust credentials as needed)
sudo -u postgres createuser attune
sudo -u postgres createdb -O attune attune

# Enable TimescaleDB extension
sudo -u postgres psql -d attune -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Apply the migrations embedded in the API package, then exit
sudo -u attune sh -c 'set -a; . /etc/attune/environment; set +a; exec /usr/bin/attune-api --config /etc/attune/attune.yaml --migrate'
```

For a v0.2.1 upgrade from a database with legacy SQLx checksums, this
`attune-api --migrate` step is required once. Its embedded runner bridges the
released checksums before SQLx validation; standalone `sqlx migrate run` cannot
perform that pre-validation bridge.

### 4. Start and enable services

```bash
sudo systemctl enable --now attune-api
sudo systemctl enable --now attune-executor
sudo systemctl enable --now attune-notifier
```

### 5. Verify

```bash
# Check service status
systemctl status attune-api attune-executor attune-notifier

# Test the API
curl http://localhost:8080/api/v1/health

# Login with the CLI
attune auth login --url http://localhost:8080
```

## File Locations

| Path | Purpose |
|------|---------|
| `/etc/attune/attune.yaml` | Main configuration file |
| `/etc/attune/environment` | Environment variables (secrets) |
| `/usr/bin/attune-*` | Service and CLI binaries |
| `/usr/lib/systemd/system/attune-*.service` | systemd service units |
| `/var/lib/attune/` | Runtime data (packs, artifacts, runtime envs) |
| `/var/log/attune/` | Log files (if file logging is enabled) |

## Uninstallation

```bash
# Debian/Ubuntu
sudo apt remove attune-api attune-executor attune-notifier
# To also remove config files:
sudo apt purge attune-api attune-executor attune-notifier

# Fedora/RHEL
sudo dnf remove attune-api attune-executor attune-notifier

# Arch
sudo pacman -R attune-api attune-executor attune-notifier
```

> **Note**: Removing packages does not delete the database or RabbitMQ data. Use `apt purge` (Debian) to also remove configuration files from `/etc/attune/` and data from `/var/lib/attune/`.
