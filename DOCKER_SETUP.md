# 🐳 Secure Bridge - Docker Setup Guide

## 📋 Prerequisites

- Docker Desktop installed (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- At least 4GB RAM available for Docker
- Ports available: 5173 (client), 8000 (server), 27017 (MongoDB), 6379 (Redis)

## 🚀 Quick Start

### 1. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
# Copy the template
cp .env.docker .env

# Edit the .env file with your actual values
# Update: JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, EMAIL_USER, EMAIL_PASSWORD
```

**Important:** Generate secure random keys for production:

```bash
# Generate JWT_SECRET (32+ characters)
openssl rand -base64 32

# Generate JWT_REFRESH_SECRET (32+ characters)
openssl rand -base64 32

# Generate ENCRYPTION_KEY (32 characters exactly)
openssl rand -hex 16
```

### 2. Build and Start All Services

```bash
# Build and start all containers
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f server
docker-compose logs -f client
```

### 3. Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/api/v1
- **Health Check:** http://localhost:8000/api/v1/health

## 🛠️ Docker Commands

### Start Services
```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d server
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f mongodb
docker-compose logs -f redis
```

### Rebuild Services
```bash
# Rebuild all services
docker-compose build

# Rebuild specific service
docker-compose build server
docker-compose build client

# Rebuild and restart
docker-compose up -d --build
```

### Execute Commands in Containers
```bash
# Access server shell
docker-compose exec server sh

# Access MongoDB shell
docker-compose exec mongodb mongosh -u admin -p securebridge123

# Access Redis CLI
docker-compose exec redis redis-cli

# Check server logs inside container
docker-compose exec server cat logs/server.log
```

### Check Container Status
```bash
# List running containers
docker-compose ps

# Check container health
docker-compose ps
docker inspect secure-bridge-server --format='{{.State.Health.Status}}'
```

## 📦 Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Docker Network                      │
│          (secure-bridge-network)                    │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Client  │  │  Server  │  │ MongoDB  │        │
│  │  :5173   │→→│  :8000   │→→│  :27017  │        │
│  │  Nginx   │  │  Node.js │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│                      ↓                              │
│                 ┌──────────┐                       │
│                 │  Redis   │                       │
│                 │  :6379   │                       │
│                 └──────────┘                       │
└─────────────────────────────────────────────────────┘
```

## 🔧 Configuration Options

### Use MongoDB Atlas (Cloud)

Edit `docker-compose.yml` and update the server environment:

```yaml
server:
  environment:
    MONGODB_URI: mongodb+srv://username:password@cluster.mongodb.net
    DB_NAME: BACKEND
```

Then remove the local MongoDB service:
```bash
docker-compose up -d --scale mongodb=0
```

### Use Upstash Redis (Cloud)

Edit `docker-compose.yml` and update the server environment:

```yaml
server:
  environment:
    REDIS_URL: rediss://default:password@redis.upstash.io:6379
```

Then remove the local Redis service:
```bash
docker-compose up -d --scale redis=0
```

### Custom Port Mapping

Edit `docker-compose.yml` to change ports:

```yaml
client:
  ports:
    - "3000:80"  # Change 5173 to 3000

server:
  ports:
    - "5000:8000"  # Change 8000 to 5000
```

## 🗄️ Data Persistence

Data is persisted in Docker volumes:

- **mongodb_data** - MongoDB database files
- **mongodb_config** - MongoDB configuration
- **redis_data** - Redis cache data
- **./server/logs** - Application logs (bind mount)
- **./server/public** - Uploaded files (bind mount)

### Backup Data
```bash
# Backup MongoDB
docker-compose exec mongodb mongodump -u admin -p securebridge123 --out /backup
docker cp secure-bridge-mongodb:/backup ./mongodb-backup

# Backup Redis
docker-compose exec redis redis-cli SAVE
docker cp secure-bridge-redis:/data/dump.rdb ./redis-backup.rdb
```

### Restore Data
```bash
# Restore MongoDB
docker cp ./mongodb-backup secure-bridge-mongodb:/backup
docker-compose exec mongodb mongorestore -u admin -p securebridge123 /backup

# Restore Redis
docker cp ./redis-backup.rdb secure-bridge-redis:/data/dump.rdb
docker-compose restart redis
```

## 🐛 Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs server

# Check if ports are in use
netstat -ano | findstr :8000
netstat -ano | findstr :5173

# Remove old containers and volumes
docker-compose down -v
docker-compose up -d --build
```

### MongoDB connection error
```bash
# Check MongoDB is running
docker-compose ps mongodb

# Test MongoDB connection
docker-compose exec mongodb mongosh -u admin -p securebridge123

# Check MongoDB logs
docker-compose logs mongodb
```

### Redis connection error
```bash
# Check Redis is running
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

### Cannot access frontend
```bash
# Check if client is running
docker-compose ps client

# Check nginx logs
docker-compose logs client

# Rebuild client
docker-compose build client
docker-compose up -d client
```

### API key decryption error
Make sure ENCRYPTION_KEY is exactly 32 characters:
```bash
# Generate new key
openssl rand -hex 16
# Update in .env file
```

## 🔒 Production Deployment

### Security Checklist
- ✅ Change all default passwords
- ✅ Use strong JWT secrets (32+ characters)
- ✅ Use secure ENCRYPTION_KEY (32 characters)
- ✅ Enable HTTPS with SSL certificates
- ✅ Use MongoDB Atlas with authentication
- ✅ Use Upstash Redis with TLS
- ✅ Set strong MongoDB admin password
- ✅ Configure firewall rules
- ✅ Enable Docker security scanning
- ✅ Regular security updates

### Production docker-compose.yml
```yaml
# Use environment variables from .env file
# Never commit .env to version control
# Use secrets management (Docker secrets, Vault, etc.)
# Enable container resource limits
# Use read-only file systems where possible
# Enable logging drivers
```

## 📊 Monitoring

### Health Checks
```bash
# Server health
curl http://localhost:8000/api/v1/health

# Container health status
docker-compose ps
```

### Resource Usage
```bash
# All containers
docker stats

# Specific container
docker stats secure-bridge-server
```

### Logs
```bash
# Real-time logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Since timestamp
docker-compose logs --since 2025-01-01T00:00:00
```

## 🧹 Cleanup

### Remove Everything
```bash
# Stop and remove containers, networks, volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Remove everything including orphaned volumes
docker-compose down -v --remove-orphans
docker volume prune -f
docker image prune -a -f
```

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Docker Hub](https://hub.docker.com/_/mongo)
- [Redis Docker Hub](https://hub.docker.com/_/redis)
- [Nginx Docker Hub](https://hub.docker.com/_/nginx)

## 💡 Tips

1. **Development Mode:** Use `docker-compose up` (without -d) to see logs in terminal
2. **Hot Reload:** Mount source code as volumes for development (not included in production setup)
3. **Environment Variables:** Never commit `.env` file to Git
4. **Backups:** Regular backups of MongoDB and Redis data
5. **Updates:** Regularly update base images for security patches

## 🆘 Support

If you encounter issues:
1. Check logs: `docker-compose logs -f`
2. Verify environment variables in `.env`
3. Ensure all ports are available
4. Try rebuilding: `docker-compose up -d --build`
5. Check Docker daemon is running
