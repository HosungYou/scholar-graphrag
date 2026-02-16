# Installation Guide

This guide covers all methods to install ScholaRAG_Graph.

## Prerequisites

### Required

- **Git** - For cloning the repository
- **API Key** - At least one LLM provider (Anthropic recommended)

### For Docker Installation

- **Docker** 20.10+ and **Docker Compose** 2.0+

### For Manual Installation

- **Python** 3.11+
- **Node.js** 18+ and **pnpm** 8+
- **PostgreSQL** 16+ with **pgvector** extension

## Method 1: Docker (Recommended)

The easiest way to get started. All dependencies are containerized.

### Step 1: Clone Repository

```bash
git clone https://github.com/HosungYou/ScholaRAG_Graph.git
cd ScholaRAG_Graph
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required: At least one LLM provider
ANTHROPIC_API_KEY=sk-ant-xxx

# Optional: Additional providers
OPENAI_API_KEY=sk-xxx
GOOGLE_API_KEY=xxx

# Database (Docker uses these defaults)
DATABASE_URL=postgresql://postgres:postgres@db:5432/scholarag_graph
```

### Step 3: Start Services

```bash
docker compose up -d
```

This starts:

- **PostgreSQL** with pgvector on port 5432
- **Backend API** on port 8000
- **Frontend** on port 3000

### Step 4: Verify Installation

```bash
# Check all services are running
docker compose ps

# Check backend health
curl http://localhost:8000/health

# Open frontend
open http://localhost:3000
```

### Updating

```bash
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Method 2: Manual Installation

For development or customization.

### Step 1: Clone Repository

```bash
git clone https://github.com/HosungYou/ScholaRAG_Graph.git
cd ScholaRAG_Graph
```

### Step 2: Set Up PostgreSQL

Install PostgreSQL 16+ with pgvector:

=== "macOS (Homebrew)"

    ```bash
    brew install postgresql@16
    brew services start postgresql@16
    
    # Install pgvector
    brew install pgvector
    ```

=== "Ubuntu/Debian"

    ```bash
    sudo apt install postgresql-16 postgresql-16-pgvector
    sudo systemctl start postgresql
    ```

=== "Windows"

    Download from [postgresql.org](https://www.postgresql.org/download/windows/)
    
    Install pgvector from [pgvector releases](https://github.com/pgvector/pgvector/releases)

Create database:

```bash
createdb scholarag_graph
psql scholarag_graph -c "CREATE EXTENSION vector;"
```

### Step 3: Set Up Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For development

# Configure environment
cp ../.env.example .env
# Edit .env with your settings

# Run migrations
python -c "from database import init_db; init_db()"

# Start server
uvicorn main:app --reload --port 8000
```

### Step 4: Set Up Frontend

In a new terminal:

```bash
cd frontend

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local if needed

# Start development server
pnpm dev
```

### Step 5: Verify Installation

- Backend API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Frontend: [http://localhost:3000](http://localhost:3000)

---

## Method 3: Development Setup

For contributors.

### Additional Tools

```bash
# Install development dependencies
cd backend
pip install -r requirements-dev.txt

# Install pre-commit hooks
pip install pre-commit
pre-commit install
```

### Running Tests

```bash
# Backend tests
cd backend
pytest --cov=. --cov-report=html

# Frontend tests
cd frontend
pnpm test
```

### Code Quality

```bash
# Format code
black .
ruff check --fix .

# Type checking
mypy .
```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | - | Claude API key |
| `OPENAI_API_KEY` | No | - | OpenAI API key |
| `GOOGLE_API_KEY` | No | - | Google AI API key |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `EMBEDDING_MODEL` | No | `text-embedding-3-small` | Embedding model |
| `LLM_PROVIDER` | No | `anthropic` | Default LLM provider |
| `LOG_LEVEL` | No | `INFO` | Logging level |

*At least one LLM provider API key is required.

### Database URL Format

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Examples:

```bash
# Local development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scholarag_graph

# Docker
DATABASE_URL=postgresql://postgres:postgres@db:5432/scholarag_graph

# Supabase
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
```

---

## Troubleshooting

### Docker Issues

**Container won't start**

```bash
# Check logs
docker compose logs backend

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

**Port already in use**

```bash
# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Use 3001 instead
```

### Database Issues

**pgvector extension not found**

```bash
# Install pgvector
# macOS
brew install pgvector

# Ubuntu
sudo apt install postgresql-16-pgvector
```

**Connection refused**

```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
psql $DATABASE_URL -c "SELECT 1;"
```

### API Key Issues

**Invalid API key error**

1. Verify key is correct in `.env`
2. Check key has correct permissions
3. Verify billing is set up for the provider

### Memory Issues

For large projects (1000+ papers):

```bash
# Increase Docker memory limit
# In docker-compose.yml:
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 4G
```

---

## Next Steps

- [Quick Start Guide](quickstart.md) - Create your first project
- [Core Concepts](../user-guide/concepts.md) - Understand the data model
- [API Reference](../api/overview.md) - Integrate with your tools
