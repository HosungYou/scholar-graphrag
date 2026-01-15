# ScholaRAG_Graph Development SUB AGENTS Plan

> **Version**: 2.0.0-draft
> **Date**: 2025-01-15
> **Purpose**: ScholaRAG_Graph 프로젝트 개발 자동화를 위한 SUB AGENTS 시스템
> **References**:
> - [wshobson/agents](https://github.com/wshobson/agents) - Plugin Architecture
> - [oh-my-claude-sisyphus](https://github.com/Yeachan-Heo/oh-my-claude-sisyphus) - Multi-Agent Orchestration
> - [ScholaRAG_Graph](https://github.com/HosungYou/ScholaRAG_Graph) - Target Project

---

## 1. Executive Summary

ScholaRAG_Graph는 Next.js 14 + FastAPI + PostgreSQL/pgvector 기반의 Knowledge Graph 플랫폼입니다. 이 문서는 **프로젝트 개발 워크플로우를 자동화**하기 위한 SUB AGENTS 시스템을 정의합니다.

### 핵심 목표

| 목표 | 설명 |
|------|------|
| **개발 속도 향상** | 반복적인 개발 작업 자동화 |
| **품질 보장** | 자동화된 코드 리뷰, 테스트, 린팅 |
| **일관성 유지** | 코드 스타일, 아키텍처 패턴 강제 |
| **배포 자동화** | Vercel/Render 배포 파이프라인 |

### 기술 스택 매핑

```
ScholaRAG_Graph Tech Stack          →    SUB AGENTS
────────────────────────────────────────────────────────
Frontend: Next.js 14, React 18      →    FrontendAgent
         React Flow, Tailwind CSS   →    UIComponentAgent
Backend:  FastAPI, Python 3.11+     →    BackendAgent
         Pydantic, SQLAlchemy       →    APIDesignAgent
Database: PostgreSQL + pgvector     →    DatabaseAgent
LLM:      Claude, GPT-4, Gemini     →    LLMIntegrationAgent
Graph:    Knowledge Graph Logic      →    GraphAgent
Deploy:   Vercel, Render            →    DevOpsAgent
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ScholaRAG_Graph Development Orchestrator                  │
│                           (Opus 4.5 - Master Router)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
  ┌────────▼────────┐       ┌────────▼────────┐       ┌────────▼────────┐
  │   Core Dev      │       │   Quality &     │       │   Operations    │
  │   Agents        │       │   Testing       │       │   Agents        │
  └─────────────────┘       └─────────────────┘       └─────────────────┘
           │                          │                          │
    ┌──────┼──────┐            ┌──────┼──────┐            ┌──────┼──────┐
    │      │      │            │      │      │            │      │      │
    ▼      ▼      ▼            ▼      ▼      ▼            ▼      ▼      ▼
┌──────┐┌──────┐┌──────┐  ┌──────┐┌──────┐┌──────┐  ┌──────┐┌──────┐┌──────┐
│Back- ││Front-││Graph │  │Code  ││Test  ││Secur-│  │DevOps││Docs  ││Debug │
│end   ││end   ││Agent │  │Review││Runner││ity   │  │Agent ││Agent ││Agent │
└──────┘└──────┘└──────┘  └──────┘└──────┘└──────┘  └──────┘└──────┘└──────┘
    │      │      │            │      │      │            │      │      │
    ▼      ▼      ▼            ▼      ▼      ▼            ▼      ▼      ▼
┌──────┐┌──────┐┌──────┐  ┌──────┐┌──────┐┌──────┐  ┌──────┐┌──────┐┌──────┐
│API   ││UI    ││LLM   │  │Lint  ││Perf  ││Depend│  │Deploy││API   ││Log   │
│Design││Comp  ││Integ │  │Agent ││Agent ││Scan  │  │Agent ││Docs  ││Analyz│
└──────┘└──────┘└──────┘  └──────┘└──────┘└──────┘  └──────┘└──────┘└──────┘
   DB
 Agent
```

---

## 3. Agent Tier System

### Tier 1: Critical Agents (Opus 4.5)
**용도**: 아키텍처 결정, 복잡한 설계, 보안 검토

| Agent | 역할 | Trigger Condition |
|-------|------|-------------------|
| `dev-orchestrator` | 전체 개발 워크플로우 조율 | 모든 개발 세션 시작 |
| `architecture-advisor` | 시스템 아키텍처 설계/검토 | `architecture`, `설계`, `구조` |
| `code-reviewer` | 심층 코드 리뷰, PR 검토 | `review`, `/review`, PR 생성 시 |
| `security-auditor` | 보안 취약점 분석 | `security`, `보안`, 민감 코드 변경 |

### Tier 2: Complex Task Agents (Sonnet 4.5)
**용도**: 도메인별 전문 개발 작업

| Agent | 역할 | Trigger Condition |
|-------|------|-------------------|
| `backend-agent` | FastAPI 라우터, 서비스 로직 | `backend/`, `.py` 파일 작업 |
| `frontend-agent` | Next.js 페이지, React 컴포넌트 | `frontend/`, `.tsx` 파일 작업 |
| `database-agent` | PostgreSQL 스키마, 마이그레이션 | `database/`, SQL, pgvector |
| `graph-agent` | Knowledge Graph 로직 | `graph/`, 노드/엣지 처리 |
| `llm-integration-agent` | Claude/GPT API 통합 | `llm/`, API 호출 코드 |
| `api-design-agent` | REST API 설계, OpenAPI 스펙 | `routers/`, endpoint 설계 |

### Tier 3: Support Agents (Sonnet 4.5)
**용도**: 테스트, 문서화, 보조 작업

| Agent | 역할 | Trigger Condition |
|-------|------|-------------------|
| `test-runner` | pytest/jest 테스트 실행 | `test`, 코드 변경 완료 후 |
| `ui-component-agent` | React Flow, Tailwind 컴포넌트 | UI 컴포넌트 작업 |
| `lint-agent` | Black, ESLint, Prettier | 코드 저장 시 |
| `docs-agent` | README, API 문서, 주석 | `docs/`, 문서화 요청 |
| `migration-agent` | DB 마이그레이션 스크립트 | 스키마 변경 시 |

### Tier 4: Fast Operations (Haiku 4.5)
**용도**: 빠른 조회, 간단한 작업

| Agent | 역할 | Trigger Condition |
|-------|------|-------------------|
| `explorer` | 코드베이스 탐색, 파일 검색 | `explore`, `find`, `where` |
| `deploy-agent` | Vercel/Render 배포 실행 | `deploy`, 배포 요청 |
| `log-analyzer` | 로그 분석, 에러 추적 | `log`, `error`, 디버깅 |
| `status-reporter` | 프로젝트 상태 요약 | `status`, `progress` |
| `dependency-scanner` | npm/pip 의존성 검사 | `deps`, 패키지 업데이트 |

---

## 4. Plugin Architecture

### 4.1 Plugin Directory Structure

```
ScholaRAG_Graph/
├── .claude/
│   ├── plugins/
│   │   ├── scholarag-backend/
│   │   │   ├── agents/
│   │   │   │   ├── backend-agent.md
│   │   │   │   ├── api-design-agent.md
│   │   │   │   └── database-agent.md
│   │   │   ├── skills/
│   │   │   │   ├── fastapi-patterns.md
│   │   │   │   ├── sqlalchemy-orm.md
│   │   │   │   └── pydantic-schemas.md
│   │   │   └── metadata.json
│   │   │
│   │   ├── scholarag-frontend/
│   │   │   ├── agents/
│   │   │   │   ├── frontend-agent.md
│   │   │   │   └── ui-component-agent.md
│   │   │   ├── skills/
│   │   │   │   ├── nextjs-app-router.md
│   │   │   │   ├── react-flow-patterns.md
│   │   │   │   └── tailwind-styling.md
│   │   │   └── metadata.json
│   │   │
│   │   ├── scholarag-graph/
│   │   │   ├── agents/
│   │   │   │   ├── graph-agent.md
│   │   │   │   └── llm-integration-agent.md
│   │   │   ├── skills/
│   │   │   │   ├── knowledge-graph-ops.md
│   │   │   │   ├── pgvector-search.md
│   │   │   │   └── llm-api-patterns.md
│   │   │   └── metadata.json
│   │   │
│   │   ├── scholarag-quality/
│   │   │   ├── agents/
│   │   │   │   ├── code-reviewer.md
│   │   │   │   ├── test-runner.md
│   │   │   │   ├── security-auditor.md
│   │   │   │   └── lint-agent.md
│   │   │   ├── skills/
│   │   │   │   ├── pytest-patterns.md
│   │   │   │   ├── jest-testing.md
│   │   │   │   └── security-checklist.md
│   │   │   └── metadata.json
│   │   │
│   │   └── scholarag-devops/
│   │       ├── agents/
│   │       │   ├── deploy-agent.md
│   │       │   ├── docs-agent.md
│   │       │   └── log-analyzer.md
│   │       ├── skills/
│   │       │   ├── vercel-deployment.md
│   │       │   ├── render-deployment.md
│   │       │   └── github-actions.md
│   │       └── metadata.json
│   │
│   ├── hooks.yaml
│   ├── routing-config.yaml
│   └── settings.json
│
├── DOCS/
│   └── SUB_AGENTS_PLAN.md  ← 이 문서
│
└── ...
```

### 4.2 Agent Definition Format

```markdown
<!-- .claude/plugins/scholarag-backend/agents/backend-agent.md -->

# Backend Agent

## Metadata
```yaml
name: backend-agent
model: sonnet
tier: 2
plugin: scholarag-backend
version: 1.0.0
```

## Description
FastAPI 백엔드 개발을 담당합니다. 라우터, 서비스 로직, 데이터 모델링을 수행합니다.

## Activation Triggers
```yaml
triggers:
  file_patterns:
    - "backend/**/*.py"
    - "**/routers/*.py"
    - "**/services/*.py"
  keywords:
    - "FastAPI"
    - "endpoint"
    - "라우터"
    - "API"
  commands:
    - "/backend"
```

## Capabilities
- FastAPI 라우터 생성 및 수정
- Pydantic 스키마 정의
- SQLAlchemy 모델 작성
- 비동기 서비스 로직 구현
- OpenAPI 스펙 생성

## Project Context
```yaml
tech_stack:
  framework: FastAPI
  python_version: "3.11+"
  orm: SQLAlchemy
  validation: Pydantic v2
  async: asyncio, httpx

code_conventions:
  style: black, isort
  type_hints: required
  docstrings: Google style
  error_handling: HTTPException

directory_structure:
  routers: backend/routers/
  services: backend/services/
  models: backend/models/
  schemas: backend/schemas/
```

## Workflow Integration
```yaml
input_from:
  - dev-orchestrator
  - architecture-advisor
output_to:
  - test-runner
  - code-reviewer
  - docs-agent
dependencies:
  - database-agent (스키마 변경 시)
```

## Standard Operations

### 1. 새 API 엔드포인트 생성
```python
# 템플릿: backend/routers/{resource}.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import get_db
from backend.schemas.{resource} import {Resource}Create, {Resource}Response

router = APIRouter(prefix="/api/{resource}", tags=["{resource}"])

@router.post("/", response_model={Resource}Response)
async def create_{resource}(
    data: {Resource}Create,
    db: AsyncSession = Depends(get_db)
):
    # Implementation
    pass
```

### 2. 서비스 로직 패턴
```python
# backend/services/{resource}_service.py
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.{resource} import {Resource}

class {Resource}Service:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: dict) -> {Resource}:
        instance = {Resource}(**data)
        self.db.add(instance)
        await self.db.commit()
        await self.db.refresh(instance)
        return instance
```
```

### 4.3 Skill Definition Format (Progressive Disclosure)

```markdown
<!-- .claude/plugins/scholarag-backend/skills/fastapi-patterns.md -->

# FastAPI Patterns Skill

## Layer 1: Metadata (Always Loaded, ~100 tokens)
```yaml
name: fastapi-patterns
category: backend-development
activation:
  - file: "backend/**/*.py"
  - keyword: "FastAPI"
```

## Layer 2: Instructions (On Activation, ~500 tokens)

### 라우터 작성 규칙
1. **Prefix 규칙**: `/api/{resource}` 형식 사용
2. **응답 모델**: 항상 `response_model` 지정
3. **의존성 주입**: `Depends()`로 DB 세션 주입
4. **에러 처리**: `HTTPException` 사용, 상세 메시지 포함
5. **비동기**: 모든 DB 작업은 `async/await` 사용

### 디렉토리 규칙
```
backend/
├── routers/      # API 엔드포인트
├── services/     # 비즈니스 로직
├── models/       # SQLAlchemy 모델
├── schemas/      # Pydantic 스키마
└── utils/        # 유틸리티 함수
```

## Layer 3: Resources (On Demand, ~1000 tokens)

### 전체 CRUD 라우터 템플릿
```python
# 전체 템플릿 코드...
```

### 에러 처리 패턴
```python
# 에러 처리 예시...
```
```

---

## 5. Intelligent Model Routing

### 5.1 Routing Configuration

```yaml
# .claude/routing-config.yaml

version: "1.0"
default_model: sonnet

routing_rules:
  # Tier 1: Opus (Critical decisions)
  - patterns:
      - "(architecture|아키텍처|설계|구조 변경)"
      - "(security|보안|취약점|인증)"
      - "(review|리뷰|PR|pull request)"
      - "(migration|마이그레이션|스키마 변경)"
    model: opus
    agents:
      - dev-orchestrator
      - architecture-advisor
      - code-reviewer
      - security-auditor
    reason: "Critical decisions requiring deep reasoning"

  # Tier 2: Sonnet (Complex development)
  - patterns:
      - "backend/.*\\.py$"
      - "(FastAPI|endpoint|라우터|API)"
    model: sonnet
    agents:
      - backend-agent
      - api-design-agent
    reason: "Backend development tasks"

  - patterns:
      - "frontend/.*\\.(tsx?|jsx?)$"
      - "(Next.js|React|컴포넌트|페이지)"
    model: sonnet
    agents:
      - frontend-agent
      - ui-component-agent
    reason: "Frontend development tasks"

  - patterns:
      - "(graph|노드|엣지|Knowledge Graph)"
      - "(LLM|Claude|GPT|임베딩)"
    model: sonnet
    agents:
      - graph-agent
      - llm-integration-agent
    reason: "Graph and LLM tasks"

  - patterns:
      - "database/.*\\.sql$"
      - "(PostgreSQL|pgvector|쿼리)"
    model: sonnet
    agents:
      - database-agent
      - migration-agent
    reason: "Database tasks"

  # Tier 3: Sonnet (Support tasks)
  - patterns:
      - "(test|테스트|pytest|jest)"
    model: sonnet
    agents:
      - test-runner
    reason: "Testing tasks"

  - patterns:
      - "(docs|문서|README)"
    model: sonnet
    agents:
      - docs-agent
    reason: "Documentation tasks"

  # Tier 4: Haiku (Fast operations)
  - patterns:
      - "(explore|find|where|찾아)"
      - "(status|상태|progress)"
    model: haiku
    agents:
      - explorer
      - status-reporter
    reason: "Quick lookups"

  - patterns:
      - "(deploy|배포|Vercel|Render)"
    model: haiku
    agents:
      - deploy-agent
    reason: "Deployment execution"

  - patterns:
      - "(log|error|에러|디버그)"
    model: haiku
    agents:
      - log-analyzer
    reason: "Log analysis"

# Fallback rules
fallback:
  model: sonnet
  agent: dev-orchestrator
```

### 5.2 Complexity Analyzer

```python
# backend/agents/router.py

from enum import Enum
from dataclasses import dataclass
from typing import List, Optional
import re

class ModelTier(Enum):
    OPUS = "opus"      # Tier 1: Critical
    SONNET = "sonnet"  # Tier 2-3: Complex/Support
    HAIKU = "haiku"    # Tier 4: Fast

@dataclass
class RoutingDecision:
    model: ModelTier
    agents: List[str]
    reason: str
    confidence: float

class TaskComplexityAnalyzer:
    """작업 복잡도를 분석하여 최적 모델 선택"""

    COMPLEXITY_WEIGHTS = {
        "file_scope": 0.25,        # 영향 받는 파일 수
        "architectural_impact": 0.30,  # 아키텍처 변경 여부
        "security_sensitivity": 0.25,  # 보안 민감도
        "reversibility": 0.20,     # 되돌리기 어려움
    }

    OPUS_KEYWORDS = [
        r"architecture", r"아키텍처", r"설계",
        r"security", r"보안", r"인증", r"권한",
        r"migration", r"마이그레이션",
        r"review", r"리뷰", r"PR",
        r"refactor", r"리팩토링",
    ]

    HAIKU_KEYWORDS = [
        r"status", r"상태", r"progress",
        r"find", r"찾아", r"explore",
        r"deploy", r"배포",
        r"log", r"에러",
    ]

    def analyze(self, task: str, context: dict) -> RoutingDecision:
        # 1. 키워드 기반 빠른 분류
        if self._matches_patterns(task, self.OPUS_KEYWORDS):
            return self._route_to_opus(task, context)

        if self._matches_patterns(task, self.HAIKU_KEYWORDS):
            return self._route_to_haiku(task, context)

        # 2. 복잡도 점수 계산
        score = self._calculate_complexity_score(task, context)

        # 3. 점수 기반 라우팅
        if score >= 0.7:
            return self._route_to_opus(task, context)
        elif score >= 0.3:
            return self._route_to_sonnet(task, context)
        else:
            return self._route_to_haiku(task, context)

    def _matches_patterns(self, text: str, patterns: List[str]) -> bool:
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    def _calculate_complexity_score(self, task: str, context: dict) -> float:
        score = 0.0

        # 파일 범위 점수
        affected_files = context.get("affected_files", [])
        if len(affected_files) > 5:
            score += self.COMPLEXITY_WEIGHTS["file_scope"]
        elif len(affected_files) > 2:
            score += self.COMPLEXITY_WEIGHTS["file_scope"] * 0.5

        # 아키텍처 영향 점수
        if context.get("creates_new_module") or context.get("modifies_interfaces"):
            score += self.COMPLEXITY_WEIGHTS["architectural_impact"]

        # 보안 민감도 점수
        sensitive_paths = ["auth", "security", "credentials", "api_keys"]
        if any(p in str(affected_files) for p in sensitive_paths):
            score += self.COMPLEXITY_WEIGHTS["security_sensitivity"]

        # 되돌리기 어려움 점수
        if context.get("database_migration") or context.get("breaking_change"):
            score += self.COMPLEXITY_WEIGHTS["reversibility"]

        return min(score, 1.0)

    def _route_to_opus(self, task: str, context: dict) -> RoutingDecision:
        return RoutingDecision(
            model=ModelTier.OPUS,
            agents=["dev-orchestrator", "architecture-advisor"],
            reason="Critical decision requiring deep analysis",
            confidence=0.9
        )

    def _route_to_sonnet(self, task: str, context: dict) -> RoutingDecision:
        # 파일 패턴으로 에이전트 결정
        agents = self._determine_agents_by_files(context.get("affected_files", []))
        return RoutingDecision(
            model=ModelTier.SONNET,
            agents=agents,
            reason="Complex development task",
            confidence=0.8
        )

    def _route_to_haiku(self, task: str, context: dict) -> RoutingDecision:
        return RoutingDecision(
            model=ModelTier.HAIKU,
            agents=["explorer", "status-reporter"],
            reason="Quick operation",
            confidence=0.85
        )

    def _determine_agents_by_files(self, files: List[str]) -> List[str]:
        agents = set()
        for file in files:
            if "backend/" in file or file.endswith(".py"):
                agents.add("backend-agent")
            if "frontend/" in file or file.endswith((".tsx", ".ts", ".jsx")):
                agents.add("frontend-agent")
            if "database/" in file or file.endswith(".sql"):
                agents.add("database-agent")
            if "graph/" in file:
                agents.add("graph-agent")
        return list(agents) or ["dev-orchestrator"]
```

---

## 6. Runtime Integration Contract

### 6.1 Plugin Discovery & Loading

```python
# backend/agents/plugin_loader.py

from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass
import json
import yaml

@dataclass
class PluginMetadata:
    name: str
    version: str
    agents: List[str]
    skills: List[str]
    dependencies: List[str]

@dataclass
class AgentDefinition:
    name: str
    model: str
    tier: int
    plugin: str
    triggers: Dict
    capabilities: List[str]
    workflow: Dict

class PluginLoader:
    """플러그인 발견 및 로딩"""

    PLUGINS_DIR = Path(".claude/plugins")

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.plugins_path = project_root / self.PLUGINS_DIR
        self._loaded_plugins: Dict[str, PluginMetadata] = {}
        self._loaded_agents: Dict[str, AgentDefinition] = {}

    def discover_plugins(self) -> List[str]:
        """사용 가능한 플러그인 목록 반환"""
        if not self.plugins_path.exists():
            return []

        plugins = []
        for plugin_dir in self.plugins_path.iterdir():
            if plugin_dir.is_dir() and (plugin_dir / "metadata.json").exists():
                plugins.append(plugin_dir.name)
        return plugins

    def load_plugin(self, plugin_name: str) -> PluginMetadata:
        """플러그인 메타데이터 로드"""
        if plugin_name in self._loaded_plugins:
            return self._loaded_plugins[plugin_name]

        plugin_path = self.plugins_path / plugin_name
        metadata_file = plugin_path / "metadata.json"

        if not metadata_file.exists():
            raise FileNotFoundError(f"Plugin not found: {plugin_name}")

        with open(metadata_file) as f:
            data = json.load(f)

        metadata = PluginMetadata(
            name=data["name"],
            version=data["version"],
            agents=data.get("agents", []),
            skills=data.get("skills", []),
            dependencies=data.get("dependencies", [])
        )

        self._loaded_plugins[plugin_name] = metadata
        return metadata

    def load_agent(self, plugin_name: str, agent_name: str) -> AgentDefinition:
        """에이전트 정의 로드"""
        cache_key = f"{plugin_name}/{agent_name}"
        if cache_key in self._loaded_agents:
            return self._loaded_agents[cache_key]

        agent_file = self.plugins_path / plugin_name / "agents" / f"{agent_name}.md"

        if not agent_file.exists():
            raise FileNotFoundError(f"Agent not found: {agent_name}")

        # 마크다운에서 YAML 프론트매터 파싱
        content = agent_file.read_text()
        definition = self._parse_agent_definition(content, plugin_name)

        self._loaded_agents[cache_key] = definition
        return definition

    def _parse_agent_definition(self, content: str, plugin_name: str) -> AgentDefinition:
        """마크다운 에이전트 정의 파싱"""
        # YAML 블록 추출 (```yaml ... ```)
        import re
        yaml_blocks = re.findall(r'```yaml\n(.*?)```', content, re.DOTALL)

        metadata = {}
        triggers = {}
        workflow = {}

        for block in yaml_blocks:
            try:
                data = yaml.safe_load(block)
                if "name" in data and "model" in data:
                    metadata = data
                elif "triggers" in data or "file_patterns" in data:
                    triggers = data
                elif "input_from" in data or "output_to" in data:
                    workflow = data
            except yaml.YAMLError:
                continue

        return AgentDefinition(
            name=metadata.get("name", "unknown"),
            model=metadata.get("model", "sonnet"),
            tier=metadata.get("tier", 2),
            plugin=plugin_name,
            triggers=triggers,
            capabilities=self._extract_capabilities(content),
            workflow=workflow
        )

    def _extract_capabilities(self, content: str) -> List[str]:
        """Capabilities 섹션 추출"""
        import re
        match = re.search(r'## Capabilities\n(.*?)(?=\n##|\Z)', content, re.DOTALL)
        if match:
            lines = match.group(1).strip().split('\n')
            return [line.lstrip('- ').strip() for line in lines if line.strip().startswith('-')]
        return []
```

### 6.2 Agent Invocation API

```python
# backend/agents/invoker.py

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from enum import Enum
import asyncio
from datetime import datetime
import uuid

class AgentStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class AgentRequest:
    """에이전트 호출 요청"""
    request_id: str
    agent_name: str
    task: str
    context: Dict[str, Any]
    model_override: Optional[str] = None
    timeout_seconds: int = 300
    priority: int = 5  # 1 (highest) - 10 (lowest)

@dataclass
class AgentResponse:
    """에이전트 응답"""
    request_id: str
    agent_name: str
    status: AgentStatus
    result: Optional[Any]
    error: Optional[str]
    execution_time_ms: int
    model_used: str
    tokens_used: int
    timestamp: datetime

class AgentInvoker:
    """에이전트 호출 관리자"""

    def __init__(self, plugin_loader, router):
        self.plugin_loader = plugin_loader
        self.router = router
        self._active_requests: Dict[str, AgentRequest] = {}
        self._results: Dict[str, AgentResponse] = {}

    async def invoke(self, request: AgentRequest) -> AgentResponse:
        """단일 에이전트 호출"""
        self._active_requests[request.request_id] = request
        start_time = datetime.now()

        try:
            # 1. 에이전트 정의 로드
            agent_def = self._load_agent_definition(request.agent_name)

            # 2. 모델 결정 (override 또는 라우팅)
            model = request.model_override or self.router.get_model(request)

            # 3. 에이전트 실행
            result = await self._execute_agent(agent_def, request, model)

            # 4. 응답 생성
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            response = AgentResponse(
                request_id=request.request_id,
                agent_name=request.agent_name,
                status=AgentStatus.COMPLETED,
                result=result,
                error=None,
                execution_time_ms=int(execution_time),
                model_used=model,
                tokens_used=result.get("tokens_used", 0),
                timestamp=datetime.now()
            )

        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds() * 1000
            response = AgentResponse(
                request_id=request.request_id,
                agent_name=request.agent_name,
                status=AgentStatus.FAILED,
                result=None,
                error=str(e),
                execution_time_ms=int(execution_time),
                model_used="unknown",
                tokens_used=0,
                timestamp=datetime.now()
            )

        finally:
            del self._active_requests[request.request_id]
            self._results[request.request_id] = response

        return response

    async def invoke_parallel(self, requests: List[AgentRequest]) -> List[AgentResponse]:
        """병렬 에이전트 호출"""
        tasks = [self.invoke(req) for req in requests]
        return await asyncio.gather(*tasks)

    async def invoke_sequential(self, requests: List[AgentRequest]) -> List[AgentResponse]:
        """순차 에이전트 호출 (이전 결과를 다음에 전달)"""
        responses = []
        context = {}

        for request in requests:
            # 이전 결과를 컨텍스트에 추가
            request.context["previous_results"] = context
            response = await self.invoke(request)
            responses.append(response)

            # 결과 저장
            if response.status == AgentStatus.COMPLETED:
                context[request.agent_name] = response.result
            else:
                break  # 실패 시 중단

        return responses

    def _load_agent_definition(self, agent_name: str):
        """에이전트 정의 검색 및 로드"""
        for plugin_name in self.plugin_loader.discover_plugins():
            try:
                return self.plugin_loader.load_agent(plugin_name, agent_name)
            except FileNotFoundError:
                continue
        raise ValueError(f"Agent not found: {agent_name}")

    async def _execute_agent(self, agent_def, request: AgentRequest, model: str) -> Dict:
        """실제 에이전트 실행 (Claude Code Task tool 호출)"""
        # 실제 구현에서는 Claude Code의 Task tool을 사용
        prompt = self._build_prompt(agent_def, request)

        # 여기서 실제 LLM 호출
        # result = await claude_code_task(prompt, model)

        return {
            "output": "Agent execution result",
            "tokens_used": 0
        }

    def _build_prompt(self, agent_def, request: AgentRequest) -> str:
        """에이전트 프롬프트 구성"""
        return f"""
[Agent: {agent_def.name}]
[Plugin: {agent_def.plugin}]
[Capabilities: {', '.join(agent_def.capabilities)}]

Task: {request.task}

Context:
{json.dumps(request.context, indent=2, ensure_ascii=False)}

Please complete the task according to the agent's capabilities and project conventions.
"""

# 사용 예시
def create_agent_request(agent_name: str, task: str, context: dict = None) -> AgentRequest:
    return AgentRequest(
        request_id=str(uuid.uuid4()),
        agent_name=agent_name,
        task=task,
        context=context or {}
    )
```

### 6.3 Message/Payload Schemas

```python
# backend/agents/schemas.py

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime
from enum import Enum

# ============================================
# Core Enums
# ============================================

class ModelTier(str, Enum):
    OPUS = "opus"
    SONNET = "sonnet"
    HAIKU = "haiku"

class AgentStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class EventType(str, Enum):
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    TOOL_USE = "tool_use"
    ERROR = "error"
    STATE_CHANGE = "state_change"

# ============================================
# Request Schemas
# ============================================

class AgentRequestSchema(BaseModel):
    """에이전트 호출 요청 스키마"""
    request_id: str = Field(..., description="고유 요청 ID")
    agent_name: str = Field(..., description="호출할 에이전트 이름")
    task: str = Field(..., description="수행할 작업 설명")
    context: Dict[str, Any] = Field(default_factory=dict, description="작업 컨텍스트")
    model_override: Optional[ModelTier] = Field(None, description="모델 강제 지정")
    timeout_seconds: int = Field(300, ge=10, le=600, description="타임아웃 (초)")
    priority: int = Field(5, ge=1, le=10, description="우선순위 (1=최고)")

    class Config:
        json_schema_extra = {
            "example": {
                "request_id": "req_abc123",
                "agent_name": "backend-agent",
                "task": "Create a new API endpoint for user authentication",
                "context": {
                    "affected_files": ["backend/routers/auth.py"],
                    "requirements": ["JWT support", "refresh tokens"]
                },
                "priority": 3
            }
        }

class BatchRequestSchema(BaseModel):
    """배치 에이전트 호출 요청"""
    batch_id: str
    requests: List[AgentRequestSchema]
    execution_mode: str = Field("parallel", pattern="^(parallel|sequential)$")
    stop_on_failure: bool = False

# ============================================
# Response Schemas
# ============================================

class AgentResponseSchema(BaseModel):
    """에이전트 응답 스키마"""
    request_id: str
    agent_name: str
    status: AgentStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: int
    model_used: ModelTier
    tokens_used: int
    timestamp: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "request_id": "req_abc123",
                "agent_name": "backend-agent",
                "status": "completed",
                "result": {
                    "files_created": ["backend/routers/auth.py"],
                    "summary": "Created JWT authentication endpoint"
                },
                "execution_time_ms": 5230,
                "model_used": "sonnet",
                "tokens_used": 1245,
                "timestamp": "2025-01-15T10:30:00Z"
            }
        }

class BatchResponseSchema(BaseModel):
    """배치 응답 스키마"""
    batch_id: str
    total_requests: int
    completed: int
    failed: int
    responses: List[AgentResponseSchema]
    total_execution_time_ms: int

# ============================================
# Event Schemas
# ============================================

class LifecycleEventSchema(BaseModel):
    """라이프사이클 이벤트 스키마"""
    event_id: str
    event_type: EventType
    timestamp: datetime
    session_id: str
    agent_name: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        json_schema_extra = {
            "example": {
                "event_id": "evt_xyz789",
                "event_type": "agent_end",
                "timestamp": "2025-01-15T10:30:05Z",
                "session_id": "sess_001",
                "agent_name": "backend-agent",
                "payload": {
                    "status": "completed",
                    "files_modified": 2
                }
            }
        }

# ============================================
# State Schemas
# ============================================

class SessionStateSchema(BaseModel):
    """세션 상태 스키마"""
    session_id: str
    project_id: str
    started_at: datetime
    current_stage: Optional[str] = None
    active_agents: List[str] = Field(default_factory=list)
    completed_agents: List[str] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    routing_history: List[Dict[str, Any]] = Field(default_factory=list)

    # 스키마 버전 관리
    schema_version: str = "1.0.0"

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "sess_001",
                "project_id": "scholarag-graph",
                "started_at": "2025-01-15T10:00:00Z",
                "current_stage": "backend_development",
                "active_agents": ["backend-agent"],
                "completed_agents": ["architecture-advisor"],
                "context": {
                    "current_task": "Implement graph API",
                    "affected_files": ["backend/routers/graph.py"]
                },
                "schema_version": "1.0.0"
            }
        }

# ============================================
# Plugin Schemas
# ============================================

class PluginMetadataSchema(BaseModel):
    """플러그인 메타데이터 스키마"""
    name: str
    version: str
    description: str
    agents: List[str]
    skills: List[str]
    dependencies: List[str] = Field(default_factory=list)
    author: Optional[str] = None
    repository: Optional[str] = None

class AgentDefinitionSchema(BaseModel):
    """에이전트 정의 스키마"""
    name: str
    model: ModelTier
    tier: int = Field(..., ge=1, le=4)
    plugin: str
    description: str
    triggers: Dict[str, Any]
    capabilities: List[str]
    workflow: Dict[str, Any] = Field(default_factory=dict)
```

---

## 7. Lifecycle Hooks System

### 7.1 Hook Definitions

```yaml
# .claude/hooks.yaml

version: "1.0"

hooks:
  # ============================================
  # Session Hooks
  # ============================================

  - name: session-start
    event: SessionStart
    description: "개발 세션 시작 시 환경 초기화"
    actions:
      - load_project_context
      - discover_plugins
      - initialize_state
    auto_execute: true

  - name: session-end
    event: SessionEnd
    description: "세션 종료 시 상태 저장"
    actions:
      - save_state
      - generate_summary
      - cleanup_temp_files

  # ============================================
  # Agent Hooks
  # ============================================

  - name: pre-agent-invoke
    event: PreAgentInvoke
    description: "에이전트 호출 전 검증"
    actions:
      - validate_request
      - check_dependencies
      - log_invocation
    conditions:
      - agent_exists
      - not_rate_limited

  - name: post-agent-invoke
    event: PostAgentInvoke
    description: "에이전트 완료 후 처리"
    actions:
      - validate_output
      - update_state
      - trigger_dependent_agents

  # ============================================
  # Tool Hooks
  # ============================================

  - name: post-tool-use
    event: PostToolUse
    description: "도구 사용 후 처리"
    conditions:
      tool_names:
        - Write
        - Edit
        - Bash
    actions:
      - log_file_changes
      - trigger_lint_check
      - update_affected_files

  - name: file-change-detector
    event: PostToolUse
    description: "파일 변경 감지 및 에이전트 트리거"
    conditions:
      tool_names:
        - Write
        - Edit
    actions:
      - detect_file_type
      - route_to_appropriate_agent
      - schedule_tests

  # ============================================
  # Error Hooks
  # ============================================

  - name: error-recovery
    event: OnError
    description: "에러 발생 시 복구 시도"
    actions:
      - log_error
      - analyze_error_type
      - suggest_fix
      - retry_if_transient
    retry:
      max_attempts: 3
      backoff_ms: 1000

  - name: build-failure-handler
    event: OnError
    description: "빌드/테스트 실패 처리"
    conditions:
      error_types:
        - build_error
        - test_failure
        - lint_error
    actions:
      - parse_error_message
      - identify_failing_file
      - suggest_fix_agent

  # ============================================
  # Completion Hooks
  # ============================================

  - name: completion-enforcer
    event: OnStop
    description: "작업 완료 강제 (Sisyphus 패턴)"
    conditions:
      - has_pending_tasks
    actions:
      - list_remaining_tasks
      - prompt_continuation
      - prevent_premature_stop

  - name: code-quality-gate
    event: PreCommit
    description: "커밋 전 품질 검사"
    actions:
      - run_linter
      - run_type_check
      - run_tests
    block_on_failure: true
```

### 7.2 Hook Implementation

```python
# backend/agents/hooks.py

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Any
from enum import Enum
import asyncio
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class HookEvent(Enum):
    SESSION_START = "SessionStart"
    SESSION_END = "SessionEnd"
    PRE_AGENT_INVOKE = "PreAgentInvoke"
    POST_AGENT_INVOKE = "PostAgentInvoke"
    POST_TOOL_USE = "PostToolUse"
    ON_ERROR = "OnError"
    ON_STOP = "OnStop"
    PRE_COMMIT = "PreCommit"

@dataclass
class HookContext:
    """훅 실행 컨텍스트"""
    event: HookEvent
    session_id: str
    timestamp: datetime
    payload: Dict[str, Any]
    previous_results: List[Any] = None

@dataclass
class HookResult:
    """훅 실행 결과"""
    hook_name: str
    success: bool
    output: Any
    error: Optional[str]
    execution_time_ms: int

class HookRegistry:
    """훅 등록 및 실행 관리"""

    def __init__(self):
        self._hooks: Dict[HookEvent, List[Callable]] = {event: [] for event in HookEvent}
        self._hook_configs: Dict[str, Dict] = {}

    def register(self, event: HookEvent, hook_fn: Callable, config: Dict = None):
        """훅 등록"""
        self._hooks[event].append(hook_fn)
        if config:
            self._hook_configs[hook_fn.__name__] = config

    def unregister(self, event: HookEvent, hook_fn: Callable):
        """훅 해제"""
        if hook_fn in self._hooks[event]:
            self._hooks[event].remove(hook_fn)

    async def trigger(self, event: HookEvent, context: HookContext) -> List[HookResult]:
        """이벤트에 등록된 모든 훅 실행"""
        results = []
        hooks = self._hooks.get(event, [])

        for hook_fn in hooks:
            try:
                start_time = datetime.now()
                config = self._hook_configs.get(hook_fn.__name__, {})

                # 조건 체크
                if not self._check_conditions(config, context):
                    continue

                # 훅 실행
                if asyncio.iscoroutinefunction(hook_fn):
                    output = await hook_fn(context)
                else:
                    output = hook_fn(context)

                execution_time = (datetime.now() - start_time).total_seconds() * 1000

                results.append(HookResult(
                    hook_name=hook_fn.__name__,
                    success=True,
                    output=output,
                    error=None,
                    execution_time_ms=int(execution_time)
                ))

            except Exception as e:
                logger.error(f"Hook {hook_fn.__name__} failed: {e}")
                results.append(HookResult(
                    hook_name=hook_fn.__name__,
                    success=False,
                    output=None,
                    error=str(e),
                    execution_time_ms=0
                ))

                # block_on_failure 체크
                if config.get("block_on_failure"):
                    break

        return results

    def _check_conditions(self, config: Dict, context: HookContext) -> bool:
        """훅 실행 조건 체크"""
        conditions = config.get("conditions", {})

        # 도구 이름 조건
        if "tool_names" in conditions:
            tool_name = context.payload.get("tool_name")
            if tool_name not in conditions["tool_names"]:
                return False

        # 에러 타입 조건
        if "error_types" in conditions:
            error_type = context.payload.get("error_type")
            if error_type not in conditions["error_types"]:
                return False

        return True


# 훅 함수 데코레이터
def hook(event: HookEvent, **config):
    """훅 등록 데코레이터"""
    def decorator(fn: Callable):
        fn._hook_event = event
        fn._hook_config = config
        return fn
    return decorator


# 기본 훅 구현
class DefaultHooks:
    """기본 훅 구현"""

    @staticmethod
    @hook(HookEvent.SESSION_START)
    async def session_start_hook(context: HookContext):
        """세션 시작 훅"""
        logger.info(f"Session started: {context.session_id}")
        return {
            "initialized": True,
            "plugins_loaded": context.payload.get("plugins", [])
        }

    @staticmethod
    @hook(HookEvent.POST_TOOL_USE, conditions={"tool_names": ["Write", "Edit"]})
    async def file_change_hook(context: HookContext):
        """파일 변경 감지 훅"""
        file_path = context.payload.get("file_path", "")
        logger.info(f"File changed: {file_path}")

        # 파일 타입에 따른 에이전트 추천
        if file_path.endswith(".py"):
            return {"recommended_agent": "backend-agent", "action": "lint_check"}
        elif file_path.endswith((".tsx", ".ts")):
            return {"recommended_agent": "frontend-agent", "action": "type_check"}
        elif file_path.endswith(".sql"):
            return {"recommended_agent": "database-agent", "action": "migration_check"}

        return {"recommended_agent": None, "action": None}

    @staticmethod
    @hook(HookEvent.ON_ERROR, retry={"max_attempts": 3, "backoff_ms": 1000})
    async def error_recovery_hook(context: HookContext):
        """에러 복구 훅"""
        error = context.payload.get("error")
        error_type = context.payload.get("error_type")

        logger.error(f"Error occurred: {error_type} - {error}")

        # 에러 타입별 복구 전략
        recovery_strategies = {
            "build_error": "Run 'npm run build' or 'pip install -e .'",
            "test_failure": "Review failing test and fix the code",
            "lint_error": "Run 'black .' or 'npm run lint:fix'",
            "import_error": "Check dependencies in requirements.txt or package.json"
        }

        return {
            "recovery_suggestion": recovery_strategies.get(error_type, "Review error details"),
            "should_retry": error_type in ["build_error", "lint_error"]
        }

    @staticmethod
    @hook(HookEvent.ON_STOP)
    async def completion_enforcer_hook(context: HookContext):
        """완료 강제 훅 (Sisyphus 패턴)"""
        pending_tasks = context.payload.get("pending_tasks", [])

        if pending_tasks:
            logger.warning(f"Pending tasks detected: {len(pending_tasks)}")
            return {
                "should_continue": True,
                "pending_count": len(pending_tasks),
                "message": f"Tasks remaining: {pending_tasks}. Continue working?"
            }

        return {"should_continue": False, "message": "All tasks completed"}
```

---

## 8. State Management

### 8.1 State Schema (Versioned)

```python
# backend/agents/state.py

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime
from pathlib import Path
import json
import asyncio
from filelock import FileLock

class StateVersion:
    """상태 스키마 버전 관리"""
    CURRENT = "1.0.0"

    MIGRATIONS = {
        "0.9.0": "1.0.0",  # 0.9.0 → 1.0.0 마이그레이션
    }

class SessionState(BaseModel):
    """세션 상태 모델"""
    # 메타데이터
    schema_version: str = StateVersion.CURRENT
    session_id: str
    project_id: str
    started_at: datetime
    updated_at: datetime

    # 진행 상태
    current_stage: Optional[str] = None
    active_agents: List[str] = Field(default_factory=list)
    completed_agents: List[str] = Field(default_factory=list)
    pending_tasks: List[Dict[str, Any]] = Field(default_factory=list)

    # 컨텍스트
    context: Dict[str, Any] = Field(default_factory=dict)
    affected_files: List[str] = Field(default_factory=list)

    # 라우팅 이력
    routing_history: List[Dict[str, Any]] = Field(default_factory=list)

    # 결과 저장
    agent_results: Dict[str, Any] = Field(default_factory=dict)

class StateManager:
    """상태 관리자 (파일 기반, 동시성 안전)"""

    STATE_DIR = Path(".scholarag-graph/state")

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.state_dir = project_root / self.STATE_DIR
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def _get_state_path(self, session_id: str) -> Path:
        return self.state_dir / f"{session_id}.json"

    def _get_lock_path(self, session_id: str) -> Path:
        return self.state_dir / f"{session_id}.lock"

    async def create_session(self, project_id: str) -> SessionState:
        """새 세션 생성"""
        import uuid
        session_id = f"sess_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

        state = SessionState(
            session_id=session_id,
            project_id=project_id,
            started_at=datetime.now(),
            updated_at=datetime.now()
        )

        await self.save_state(state)
        return state

    async def load_state(self, session_id: str) -> Optional[SessionState]:
        """상태 로드 (락 사용)"""
        state_path = self._get_state_path(session_id)
        lock_path = self._get_lock_path(session_id)

        if not state_path.exists():
            return None

        with FileLock(lock_path):
            with open(state_path) as f:
                data = json.load(f)

            # 버전 마이그레이션
            data = self._migrate_if_needed(data)

            return SessionState(**data)

    async def save_state(self, state: SessionState):
        """상태 저장 (락 사용)"""
        state_path = self._get_state_path(state.session_id)
        lock_path = self._get_lock_path(state.session_id)

        state.updated_at = datetime.now()

        with FileLock(lock_path):
            with open(state_path, 'w') as f:
                json.dump(state.model_dump(mode='json'), f, indent=2, default=str)

    async def update_state(self, session_id: str, updates: Dict[str, Any]) -> SessionState:
        """상태 부분 업데이트"""
        state = await self.load_state(session_id)
        if not state:
            raise ValueError(f"Session not found: {session_id}")

        for key, value in updates.items():
            if hasattr(state, key):
                setattr(state, key, value)

        await self.save_state(state)
        return state

    def _migrate_if_needed(self, data: Dict) -> Dict:
        """스키마 버전 마이그레이션"""
        current_version = data.get("schema_version", "0.9.0")

        while current_version in StateVersion.MIGRATIONS:
            target_version = StateVersion.MIGRATIONS[current_version]
            data = self._apply_migration(data, current_version, target_version)
            current_version = target_version

        data["schema_version"] = StateVersion.CURRENT
        return data

    def _apply_migration(self, data: Dict, from_v: str, to_v: str) -> Dict:
        """마이그레이션 적용"""
        if from_v == "0.9.0" and to_v == "1.0.0":
            # 예: 필드 이름 변경
            if "old_field_name" in data:
                data["new_field_name"] = data.pop("old_field_name")
        return data

    async def list_sessions(self, project_id: Optional[str] = None) -> List[str]:
        """세션 목록 조회"""
        sessions = []
        for state_file in self.state_dir.glob("sess_*.json"):
            session_id = state_file.stem
            if project_id:
                state = await self.load_state(session_id)
                if state and state.project_id == project_id:
                    sessions.append(session_id)
            else:
                sessions.append(session_id)
        return sorted(sessions, reverse=True)

    async def cleanup_old_sessions(self, days: int = 7):
        """오래된 세션 정리"""
        cutoff = datetime.now().timestamp() - (days * 24 * 60 * 60)

        for state_file in self.state_dir.glob("sess_*.json"):
            if state_file.stat().st_mtime < cutoff:
                state_file.unlink()
                lock_file = self._get_lock_path(state_file.stem)
                if lock_file.exists():
                    lock_file.unlink()
```

---

## 9. Development Workflow Integration

### 9.1 Workflow Patterns

```yaml
# .claude/workflows/development.yaml

workflows:
  # ============================================
  # Feature Development Workflow
  # ============================================
  feature-development:
    name: "New Feature Development"
    description: "새 기능 개발 표준 워크플로우"
    stages:
      - stage: design
        agents: [architecture-advisor]
        model: opus
        outputs: [design_doc, affected_files]

      - stage: backend
        agents: [backend-agent, api-design-agent, database-agent]
        model: sonnet
        parallel: true
        depends_on: [design]

      - stage: frontend
        agents: [frontend-agent, ui-component-agent]
        model: sonnet
        parallel: true
        depends_on: [backend]  # API 완성 후

      - stage: integration
        agents: [graph-agent, llm-integration-agent]
        model: sonnet
        depends_on: [backend, frontend]

      - stage: testing
        agents: [test-runner, lint-agent]
        model: sonnet
        parallel: true
        depends_on: [integration]

      - stage: review
        agents: [code-reviewer, security-auditor]
        model: opus
        depends_on: [testing]

      - stage: deploy
        agents: [deploy-agent, docs-agent]
        model: haiku
        depends_on: [review]

  # ============================================
  # Bug Fix Workflow
  # ============================================
  bug-fix:
    name: "Bug Fix"
    description: "버그 수정 워크플로우"
    stages:
      - stage: analyze
        agents: [log-analyzer, explorer]
        model: haiku

      - stage: fix
        agents: [backend-agent, frontend-agent]  # 버그 위치에 따라 선택
        model: sonnet
        depends_on: [analyze]

      - stage: verify
        agents: [test-runner]
        model: sonnet
        depends_on: [fix]

      - stage: review
        agents: [code-reviewer]
        model: sonnet
        depends_on: [verify]

  # ============================================
  # Database Migration Workflow
  # ============================================
  database-migration:
    name: "Database Schema Change"
    description: "데이터베이스 스키마 변경 워크플로우"
    stages:
      - stage: design
        agents: [architecture-advisor, database-agent]
        model: opus

      - stage: migration
        agents: [migration-agent]
        model: sonnet
        depends_on: [design]

      - stage: test
        agents: [test-runner]
        model: sonnet
        depends_on: [migration]

      - stage: review
        agents: [code-reviewer, security-auditor]
        model: opus
        depends_on: [test]
```

### 9.2 Development Commands

```yaml
# CLAUDE.md에 추가할 개발 명령어

## Development Commands

### 에이전트 명시적 호출
```bash
# 특정 에이전트 호출
"backend-agent로 새 API 엔드포인트 만들어줘"
"frontend-agent 사용해서 컴포넌트 수정해줘"
"database-agent로 마이그레이션 스크립트 작성해줘"

# 워크플로우 실행
"/workflow feature-development"
"/workflow bug-fix"
"/workflow database-migration"

# 병렬 에이전트 실행
"backend-agent와 frontend-agent 병렬로 실행해서 작업해줘"
```

### 상태 확인
```bash
"/status"           # 현재 세션 상태
"/agents"           # 활성 에이전트 목록
"/history"          # 에이전트 실행 이력
```

### 품질 검사
```bash
"/lint"             # 린트 실행
"/test"             # 테스트 실행
"/review"           # 코드 리뷰
"/security"         # 보안 감사
```

### 배포
```bash
"/deploy vercel"    # Vercel 배포
"/deploy render"    # Render 배포
"/deploy all"       # 전체 배포
```
```

---

## 10. Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] `.claude/plugins/` 디렉토리 구조 생성
- [ ] Plugin Loader 구현
- [ ] State Manager 구현 (버전 관리 포함)
- [ ] Hook Registry 구현
- [ ] 기본 routing-config.yaml 작성

### Phase 2: Core Agents (Week 3-4)
- [ ] `dev-orchestrator` (Tier 1)
- [ ] `backend-agent` (Tier 2)
- [ ] `frontend-agent` (Tier 2)
- [ ] `database-agent` (Tier 2)
- [ ] 에이전트 간 통신 테스트

### Phase 3: Quality & Operations Agents (Week 5-6)
- [ ] `code-reviewer` (Tier 1)
- [ ] `test-runner` (Tier 3)
- [ ] `deploy-agent` (Tier 4)
- [ ] `lint-agent` (Tier 3)
- [ ] Hook 시스템 통합

### Phase 4: Advanced Features (Week 7-8)
- [ ] `graph-agent` (Tier 2)
- [ ] `llm-integration-agent` (Tier 2)
- [ ] `security-auditor` (Tier 1)
- [ ] Workflow orchestration
- [ ] 전체 통합 테스트

---

## Appendix A: Agent Quick Reference

| Agent | Plugin | Tier | Model | Primary Trigger |
|-------|--------|------|-------|-----------------|
| dev-orchestrator | core | 1 | opus | Session start |
| architecture-advisor | core | 1 | opus | `architecture` |
| code-reviewer | quality | 1 | opus | `/review`, PR |
| security-auditor | quality | 1 | opus | `security` |
| backend-agent | backend | 2 | sonnet | `backend/*.py` |
| frontend-agent | frontend | 2 | sonnet | `frontend/*.tsx` |
| database-agent | backend | 2 | sonnet | `*.sql`, pgvector |
| graph-agent | graph | 2 | sonnet | `graph/` |
| llm-integration-agent | graph | 2 | sonnet | `llm/` |
| api-design-agent | backend | 2 | sonnet | `routers/` |
| test-runner | quality | 3 | sonnet | `test` |
| ui-component-agent | frontend | 3 | sonnet | UI components |
| lint-agent | quality | 3 | sonnet | File save |
| docs-agent | devops | 3 | sonnet | `docs/` |
| migration-agent | backend | 3 | sonnet | Schema change |
| explorer | core | 4 | haiku | `explore`, `find` |
| deploy-agent | devops | 4 | haiku | `deploy` |
| log-analyzer | devops | 4 | haiku | `log`, `error` |
| status-reporter | core | 4 | haiku | `status` |
| dependency-scanner | devops | 4 | haiku | `deps` |

---

## Appendix B: File Locations

| 파일 | 위치 | 설명 |
|------|------|------|
| Plugin 정의 | `.claude/plugins/*/` | 에이전트, 스킬 정의 |
| Hooks 설정 | `.claude/hooks.yaml` | 라이프사이클 훅 |
| Routing 설정 | `.claude/routing-config.yaml` | 모델 라우팅 규칙 |
| 세션 상태 | `.scholarag-graph/state/` | 세션별 상태 JSON |
| 이 문서 | `DOCS/SUB_AGENTS_PLAN.md` | 아키텍처 계획 |

---

*Last Updated: 2025-01-15*
*Next Review: After Phase 1 completion*
