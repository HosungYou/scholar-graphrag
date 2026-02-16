# ScholaRAG_Graph Documentation

Welcome to ScholaRAG_Graph - an open-source, concept-centric knowledge graph platform for systematic literature reviews.

## What is ScholaRAG_Graph?

ScholaRAG_Graph combines the power of:

- **InfraNodus-style Gap Detection** - Discover structural holes in research landscapes
- **NLP-AKG Academic Entity Extraction** - Extract concepts, methods, and findings using LLMs
- **Connected Papers-style Visualization** - Interactive force-directed graph visualization
- **Multi-Agent Reasoning System** - 6-agent pipeline for intelligent literature analysis

## Key Features

| Feature | Description |
|---------|-------------|
| **Concept-Centric Design** | Papers become metadata; concepts are the primary nodes |
| **Automated Gap Detection** | K-means clustering identifies under-explored research areas |
| **AI Research Questions** | LLM-generated questions bridge conceptual gaps |
| **PRISMA 2020 Compatible** | Full systematic review workflow support |
| **Multi-LLM Support** | Works with Claude, GPT-4, Gemini, and local models |

## Quick Links

<div class="grid cards" markdown>

-   :material-download: **[Installation](getting-started/installation.md)**
    
    Get ScholaRAG_Graph running on your system

-   :material-rocket-launch: **[Quick Start](getting-started/quickstart.md)**
    
    Create your first knowledge graph in 5 minutes

-   :material-book-open: **[User Guide](user-guide/concepts.md)**
    
    Learn core concepts and features

-   :material-api: **[API Reference](api/overview.md)**
    
    Integrate with your applications

</div>

## Why ScholaRAG_Graph?

### vs. Other Tools

| Feature | ScholaRAG_Graph | InfraNodus | Connected Papers | Elicit |
|---------|-----------------|------------|------------------|--------|
| Concept Extraction | ✅ Academic | ⚠️ Keywords | ❌ | ✅ |
| Gap Detection | ✅ | ✅ | ❌ | ❌ |
| Graph Visualization | ✅ | ✅ | ✅ | ❌ |
| PRISMA Workflow | ✅ | ❌ | ❌ | ⚠️ |
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Self-Hostable | ✅ | ❌ | ❌ | ❌ |

### For Researchers

- **No coding required** - Intuitive web interface
- **Privacy-first** - Self-host your sensitive research data
- **Cost-effective** - Free and open source (bring your own LLM API key)

### For Developers

- **Modern stack** - Next.js 14 + FastAPI + PostgreSQL
- **Extensible** - Modular agent architecture
- **Well-documented** - OpenAPI specs, type hints, comprehensive tests

## Getting Started

```bash
# Using Docker (recommended)
git clone https://github.com/HosungYou/ScholaRAG_Graph.git
cd ScholaRAG_Graph
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
docker compose up -d
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Community

- **GitHub Issues**: [Report bugs & request features](https://github.com/HosungYou/ScholaRAG_Graph/issues)
- **Discussions**: [Ask questions & share ideas](https://github.com/HosungYou/ScholaRAG_Graph/discussions)
- **Contributing**: See our [Contributing Guide](https://github.com/HosungYou/ScholaRAG_Graph/blob/main/CONTRIBUTING.md)

## License

ScholaRAG_Graph is released under the [MIT License](https://github.com/HosungYou/ScholaRAG_Graph/blob/main/LICENSE).

---

*Built with ❤️ for the research community*
