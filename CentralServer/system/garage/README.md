# Garage Object Storage with Web UI

This directory contains the Docker Compose configuration for running Garage object storage with a web-based administration interface.

## Services

### centralserver-garage
- **Image**: `docker.io/dxflrs/garage:v2.0.0-rc1`
- **Ports**: 
  - `3900`: S3 API
  - `3901`: RPC API  
  - `3902`: S3 Web API
  - `3903`: Admin API
- **Purpose**: S3-compatible object storage service

### centralserver-garage-webui
- **Image**: `khairul169/garage-webui:latest`
- **Port**: `8082:3909` (Web UI accessible at http://localhost:8082)
- **Purpose**: Web-based admin interface for managing Garage

## Features

The Garage Web UI provides:
- Garage health status monitoring
- Cluster & layout management
- Bucket management (create, update, view)
- Integrated object/bucket browser
- Access key management

## Setup

1. Copy the example configuration:
   ```bash
   cp garage.example.toml garage.toml
   cp .env.example .env
   ```

2. Update the configuration:
   - Edit `garage.toml` with your specific settings
   - Change the default tokens in the configuration file for security

3. Start the services:
   ```bash
   docker compose up -d
   ```

4. Access the Web UI at http://localhost:8082

## Configuration

The `garage.toml` file contains the main Garage configuration. Key settings include:

- **RPC Secret**: Used for internal cluster communication
- **Admin Token**: Required for admin API access (used by Web UI)
- **Metrics Token**: For metrics collection
- **S3 Region**: Default region for S3 API

**Important**: Change the default tokens in production for security!

## Volumes

- `centralserver-garage_data`: Object storage data
- `centralserver-garage_meta`: Metadata storage

## Network Access

The services communicate internally using Docker's default network. The Web UI connects to Garage using:
- Admin API: `http://centralserver-garage:3903`
- S3 API: `http://centralserver-garage:3900`