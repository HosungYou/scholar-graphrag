# Multi-Agent 시스템 스펙 (6-Agent Pipeline)

## 서비스 개요

| 항목 | 내용 |
|------|------|
| **역할** | 사용자 질의를 처리하는 6-Agent 파이프라인 |
| **아키텍처** | AGENTiGraph 기반 |
| **구현 언어** | Python (asyncio) |
| **LLM 지원** | Anthropic, OpenAI, Google |
| **Fallback** | 키워드 기반 규칙 시스템 |

---

## 아키텍처

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          AgentOrchestrator                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   User Query                                                               │
│       │                                                                    │
│       ▼                                                                    │
│  ┌─────────────┐     ┌─────────────────────┐     ┌────────────────────┐  │
│  │ 1. Intent   │ ──► │ 2. Concept          │ ──► │ 3. Task Planning   │  │
│  │    Agent    │     │    Extraction Agent │     │    Agent           │  │
│  └─────────────┘     └─────────────────────┘     └────────────────────┘  │
│                                                            │              │
│       ┌────────────────────────────────────────────────────┘              │
│       ▼                                                                    │
│  ┌─────────────────────┐     ┌─────────────────┐     ┌────────────────┐  │
│  │ 4. Query Execution  │ ──► │ 5. Reasoning    │ ──► │ 6. Response    │  │
│  │    Agent            │     │    Agent        │     │    Agent       │  │
│  └─────────────────────┘     └─────────────────┘     └────────────────┘  │
│                                                            │              │
│                                                            ▼              │
│                                                    Final Response         │
│                                                    + Citations            │
│                                                    + Graph Highlights     │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent 상세 스펙

### 1. Intent Agent

| 항목 | 내용 |
|------|------|
| **역할** | 사용자 의도 분류 |
| **기법** | Few-Shot Learning |
| **Fallback** | 키워드 기반 규칙 |

#### Intent 유형

| Intent | 설명 | 예시 질의 |
|--------|------|-----------|
| `SEARCH` | 엔티티/논문 검색 | "What papers discuss machine learning?" |
| `EXPLORE` | 관계 탐색 | "Show me papers connected to this author" |
| `EXPLAIN` | 개념 설명 | "Explain what this methodology means" |
| `COMPARE` | 비교 분석 | "Compare paper A with paper B" |
| `SUMMARIZE` | 요약 | "Summarize the findings" |
| `IDENTIFY_GAPS` | 연구 갭 분석 | "What are the research gaps?" |

#### 구현

```python
# backend/agents/intent_agent.py
class IntentAgent:
    FEW_SHOT_EXAMPLES = [
        {"query": "What papers discuss machine learning?", "intent": "search"},
        {"query": "Show me papers connected to this author", "intent": "explore"},
        {"query": "Compare paper A with paper B", "intent": "compare"},
        # ...
    ]

    SYSTEM_PROMPT = """Classify queries into: search, explore, explain, compare, summarize, identify_gaps.
    Respond with JSON: {"intent": "<type>", "confidence": 0.0-1.0, "keywords": [], "reasoning": "brief"}"""

    async def classify(self, query: str) -> IntentResult:
        if self.llm:
            return await self._classify_with_llm(query)
        return self._classify_with_keywords(query)  # Fallback
```

#### 진행률: 100% ✅

---

### 2. Concept Extraction Agent

| 항목 | 내용 |
|------|------|
| **역할** | 질의에서 엔티티 추출 및 그래프 매칭 |
| **기법** | LLM 기반 Named Entity Recognition |
| **Fallback** | 키워드 추출 |

#### 추출 대상

| 엔티티 타입 | 설명 |
|-------------|------|
| `Paper` | 논문 제목 |
| `Author` | 저자 이름 |
| `Concept` | 연구 개념 |
| `Method` | 연구 방법론 |
| `Finding` | 연구 결과 |

#### 구현

```python
# backend/agents/concept_extraction_agent.py
class ConceptExtractionAgent:
    SYSTEM_PROMPT = """Extract entities from user queries about a research knowledge graph.
    Entity types: Paper, Author, Concept, Method, Finding.
    Respond with JSON:
    {
        "entities": [{"text": "entity name", "entity_type": "type", "confidence": 0.0-1.0}],
        "keywords": ["key", "terms"],
        "query_without_entities": "query with entities removed"
    }"""

    async def extract(self, query: str) -> ExtractionResult:
        if self.llm:
            result = await self._extract_with_llm(query)
            # Graph 매칭 시도
            if self.graph_store:
                for entity in result.entities:
                    entity.matched_id = await self.match_to_graph(entity.text, entity.entity_type)
            return result
        return self._extract_with_keywords(query)
```

#### 진행률: 100% ✅

---

### 3. Task Planning Agent

| 항목 | 내용 |
|------|------|
| **역할** | 복잡한 질의를 실행 가능한 서브태스크로 분해 |
| **기법** | Intent 기반 규칙 |
| **의존성 관리** | DAG (Directed Acyclic Graph) |

#### 태스크 유형

| Task Type | 설명 |
|-----------|------|
| `search` | 엔티티/논문 검색 |
| `retrieve` | 특정 엔티티 상세 정보 조회 |
| `analyze` | 결과 분석 |
| `compare` | 두 엔티티 비교 |
| `analyze_gaps` | 연구 갭 분석 |

#### Intent별 태스크 분해

```python
# backend/agents/task_planning_agent.py
async def plan(self, query: str, intent: IntentType, extracted_entities: list) -> TaskPlan:
    if intent == IntentType.COMPARE:
        return TaskPlan(tasks=[
            SubTask(task_type="search", description="Find first entity", parameters={"entity_index": 0}),
            SubTask(task_type="search", description="Find second entity", parameters={"entity_index": 1}),
            SubTask(task_type="compare", description="Compare the two entities", depends_on=[0, 1]),
        ])
    elif intent == IntentType.IDENTIFY_GAPS:
        return TaskPlan(tasks=[
            SubTask(task_type="analyze_gaps", description="Find research gaps", parameters={"min_papers": 3}),
        ])
    # ...
```

#### 진행률: 100% ✅

---

### 4. Query Execution Agent

| 항목 | 내용 |
|------|------|
| **역할** | 서브태스크 실행 (DB 쿼리, 벡터 검색, 그래프 탐색) |
| **연동** | PostgreSQL, pgvector, Graph Store |
| **실행 방식** | 의존성 기반 순차/병렬 실행 |

#### 실행 흐름

```python
# backend/agents/query_execution_agent.py
async def execute(self, task_plan) -> ExecutionResult:
    results = []
    for i, task in enumerate(task_plan.tasks):
        # 의존성 체크
        deps_satisfied = all(
            results[dep].success for dep in task.depends_on if dep < len(results)
        )
        if not deps_satisfied:
            results.append(QueryResult(success=False, error="Dependencies not satisfied"))
            continue

        # 태스크 타입별 실행
        if task.task_type == "search":
            data = await self._execute_search(task.parameters)
        elif task.task_type == "retrieve":
            data = await self._execute_retrieve(task.parameters)
        elif task.task_type == "analyze_gaps":
            data = await self._execute_gap_analysis(task.parameters)

        results.append(QueryResult(success=True, data=data))

    return ExecutionResult(results=results)
```

#### 구현 상태

| 메서드 | 상태 |
|--------|------|
| `_execute_search` | ⚠️ TODO (vector_store 연동 필요) |
| `_execute_retrieve` | ⚠️ TODO (graph_store 연동 필요) |
| `_execute_gap_analysis` | ⚠️ TODO (graph_store 연동 필요) |

#### 진행률: 40% ⚠️

---

### 5. Reasoning Agent

| 항목 | 내용 |
|------|------|
| **역할** | Chain-of-Thought 추론으로 결과 종합 |
| **기법** | LLM 기반 단계적 추론 |
| **Fallback** | 구조화된 기본 추론 |

#### 추론 구조

```python
# backend/agents/reasoning_agent.py
class ReasoningStep(BaseModel):
    step_number: int
    description: str
    evidence: list[str] = []
    conclusion: str

class ReasoningResult(BaseModel):
    steps: list[ReasoningStep]
    final_conclusion: str
    confidence: float
    supporting_nodes: list[str] = []
    supporting_edges: list[str] = []
```

#### System Prompt

```python
SYSTEM_PROMPT = """You are a research analyst synthesizing knowledge graph query results.
Apply step-by-step reasoning to answer the user's question.

For each step:
1. Examine the evidence
2. Identify patterns and connections
3. Draw logical conclusions

Respond with JSON:
{
    "steps": [{"step_number": 1, "description": "...", "evidence": [...], "conclusion": "..."}],
    "final_conclusion": "comprehensive answer",
    "confidence": 0.0-1.0
}"""
```

#### 진행률: 100% ✅

---

### 6. Response Agent

| 항목 | 내용 |
|------|------|
| **역할** | 사용자 친화적 응답 생성 |
| **출력** | 답변, Citation, Graph Highlights, Follow-up 질문 |
| **Fallback** | 구조화된 텍스트 응답 |

#### 응답 구조

```python
# backend/agents/response_agent.py
class ResponseResult(BaseModel):
    answer: str
    citations: list[Citation] = []
    highlighted_nodes: list[str] = []
    highlighted_edges: list[str] = []
    suggested_follow_ups: list[str] = []
```

#### Follow-up 질문 생성

```python
def _default_follow_ups(self, intent) -> list[str]:
    follow_ups_map = {
        "search": ["What methods do these papers use?", "Show related concepts", "Who are the key authors?"],
        "explore": ["What are the main findings?", "Show citation network", "Compare with related papers"],
        "explain": ["Show me examples", "What papers discuss this?", "Are there related concepts?"],
        "compare": ["What methods differ?", "Which has more citations?", "What do they have in common?"],
        "identify_gaps": ["What topics are well-covered?", "Suggest research directions", "Show recent trends"],
    }
    return follow_ups_map.get(intent, ["Show related papers", "What methods are used?", "Find research gaps"])
```

#### 진행률: 100% ✅

---

## Orchestrator

### 역할

6개 에이전트를 순차적으로 실행하고 결과를 조율

### 파이프라인 흐름

```python
# backend/agents/orchestrator.py
async def process_query(self, query: str, project_id: str) -> OrchestratorResult:
    # Step 1: Intent Classification
    intent_result = await self.intent_agent.classify(query)

    # Step 2: Concept/Entity Extraction
    extraction_result = await self.concept_agent.extract(query)

    # Step 3: Task Planning
    task_plan = await self.planning_agent.plan(query, intent_result.intent, extraction_result.entities)

    # Step 4: Query Execution
    execution_result = await self.execution_agent.execute(task_plan)

    # Step 5: Reasoning
    reasoning_result = await self.reasoning_agent.reason(query, intent_result.intent, execution_result)

    # Step 6: Response Generation
    response_result = await self.response_agent.generate(query, reasoning_result, intent_result.intent)

    return OrchestratorResult(
        content=response_result.answer,
        citations=[c.label for c in response_result.citations],
        highlighted_nodes=response_result.highlighted_nodes,
        highlighted_edges=response_result.highlighted_edges,
        suggested_follow_ups=response_result.suggested_follow_ups,
    )
```

### 대화 컨텍스트 관리

```python
@dataclass
class ConversationContext:
    conversation_id: str
    project_id: str
    messages: list = field(default_factory=list)
    highlighted_nodes: list = field(default_factory=list)
    highlighted_edges: list = field(default_factory=list)
    created_at: datetime
    last_updated: datetime
```

---

## LLM 통합

### 지원 Provider

| Provider | 모델 | 상태 | 비용 | 성능 | 추천 용도 |
|----------|------|------|------|------|----------|
| **Groq** | llama-3.3-70b-versatile | 🟢 기본 | 무료 (14.4K req/day) | 매우 빠름 (67 tok/s) | 프로덕션 (권장) |
| **OpenAI** | gpt-4o-mini | 🟢 옵션 | 유료 | 매우 높음 | 고정확도 필요 시 |
| **Anthropic** | claude-3-5-haiku | 🟡 옵션 | 유료 | 높음 | 복잡한 추론 시 |
| **Google** | gemini-1.5-flash | 🟡 옵션 | 유료 | 높음 | 멀티모달 필요 시 |

#### Groq 선택 이유

1. **비용**: 무료 Tier 제공 (14,400 req/day)
2. **속도**: 70B 모델도 초당 67 토큰 처리 (매우 빠름)
3. **안정성**: Production-ready API
4. **LLM 성능**: Llama 3.3 70B는 Claude 3.5 Haiku와 유사 수준

#### 환경변수 설정

```env
# Groq (기본, 무료)
GROQ_API_KEY=gsk_...
DEFAULT_LLM_PROVIDER=groq
DEFAULT_LLM_MODEL=llama-3.3-70b-versatile

# Embedding Provider (별도 관리)
OPENAI_API_KEY=sk-...  # text-embedding-3-small 용도로만 사용

# Optional Fallback
ANTHROPIC_API_KEY=sk-ant-...  # Groq 불가 시 대체
```

### Provider 우선순위

```python
# backend/routers/chat.py의 LLM Provider 선택 로직

PROVIDER_PRIORITY = [
    "groq",           # 1순위: 빠르고 무료
    "anthropic",      # 2순위: Fallback
    "openai",         # 3순위: Fallback
    "google"          # 4순위: Fallback
]
```

### Fallback 전략

모든 에이전트는 LLM 사용 불가 시 키워드 기반 규칙으로 Fallback:

```python
async def classify(self, query: str) -> IntentResult:
    if self.llm:
        try:
            return await self._classify_with_llm(query)
        except Exception as e:
            logger.warning(f"LLM classification failed: {e}")
    return self._classify_with_keywords(query)  # Fallback
```

### Rate Limiting (Groq)

```python
# Groq Free Tier: 14,400 requests/day
requests_per_minute = 14400 / (24 * 60) ≈ 10 req/min

# 구현 예시
llm_provider = GroqProvider(
    api_key=settings.groq_api_key,
    requests_per_minute=10  # Rate limiter 적용
)
```

---

## 구현 진행률

### 전체: 95%

```
[████████████████████████░] 95%
```

| 컴포넌트 | 진행률 | 상태 |
|----------|--------|------|
| Intent Agent | 100% | ✅ |
| Concept Extraction Agent | 100% | ✅ |
| Task Planning Agent | 100% | ✅ |
| Query Execution Agent | 40% | ⚠️ (DB 연동 필요) |
| Reasoning Agent | 100% | ✅ |
| Response Agent | 100% | ✅ |
| Orchestrator | 100% | ✅ |
| Conversation Context | 100% | ✅ |

---

## 향후 요구사항

### 우선순위 높음
- [ ] Query Execution Agent DB 연동 (`_execute_search`, `_execute_retrieve`)
- [ ] Graph Store 실제 쿼리 구현
- [ ] Vector 유사도 검색 연동

### 우선순위 중간
- [ ] 대화 컨텍스트 DB 영속화
- [ ] 캐싱 레이어 추가
- [ ] 응답 스트리밍 (SSE)

### 우선순위 낮음
- [ ] 에이전트별 성능 메트릭
- [ ] A/B 테스트 프레임워크
- [ ] 멀티 LLM 동시 호출

---

## 파일 구조

```
backend/agents/
├── __init__.py
├── orchestrator.py          # 메인 조율자
├── intent_agent.py          # 1. Intent 분류
├── concept_extraction_agent.py  # 2. 엔티티 추출
├── task_planning_agent.py   # 3. 태스크 분해
├── query_execution_agent.py # 4. 쿼리 실행
├── reasoning_agent.py       # 5. 추론
└── response_agent.py        # 6. 응답 생성
```

---

## 의존성

| 컴포넌트 | 의존 관계 |
|----------|----------|
| LLM Provider | Claude/OpenAI/Google API |
| Graph Store | PostgreSQL + pgvector |
| Vector Store | pgvector 임베딩 검색 |
| Chat Router | `/api/chat` 엔드포인트 |
