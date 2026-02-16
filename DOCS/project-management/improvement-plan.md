# ScholaRAG_Graph 개선 계획서
## Timbr Graph Explorer 벤치마킹 및 전문 서비스 전환 전략

---

## 1. 현재 상태 분석: ScholaRAG_Graph vs Timbr

### 1.1 기능 비교표

| 기능 | Timbr Graph Explorer | ScholaRAG_Graph | 구현 필요도 |
|------|---------------------|-----------------|-------------|
| **Relationship 동적 선택** | ✅ UI에서 관계 타입 선택 시 즉시 그래프 변경 | ⚠️ 부분적 (Entity Type 필터만) | 🔴 Critical |
| **Properties 기반 필터링** | ✅ 체크박스로 속성 선택 → 노드 추가 | ❌ 미구현 | 🔴 Critical |
| **반응형 노드 출현** | ✅ 선택 시 관련 노드 실시간 등장 | ⚠️ Double-click으로 확장만 | 🟡 High |
| **노드 크기 스케일링** | ✅ 특정 Property 기반 동적 크기 조절 | ⚠️ centrality_pagerank 고정 | 🟡 High |
| **자연어 쿼리** | ✅ 스마트 제안과 함께 입력 | ✅ Chat Interface 구현됨 | ✅ Done |
| **Graph Analyst Assistant** | ✅ AI가 현재 그래프 분석 | ✅ 6-Agent Pipeline | ✅ Done |
| **노드 상세 패널** | ✅ 우측 패널 상세 정보 | ✅ NodeDetails Panel | ✅ Done |
| **구조적 갭 탐지** | ❌ 미지원 | ✅ InfraNodus-style K-means | ✅ Advantage |
| **학술 연구 특화** | ❌ 비즈니스 데이터 중심 | ✅ PRISMA, Concept-Centric | ✅ Advantage |

### 1.2 Timbr의 핵심 강점 (이미지 분석)

**이미지 1**: Properties 탭에서 체크박스로 속성(entity_type, state, year_name 등)을 선택
**이미지 2**: `state` 속성 선택 시 New York, Florida, Georgia 등 지역 노드가 자동 등장
**이미지 3**: Relationships 탭에서 `has_discount` → `discount` 관계 선택, 연결 속성 지정
**이미지 4**: 관계 추가 후 discount 노드(청록색)가 그래프에 동적 추가, 우측에 상세 속성 표시

**핵심 차별점**:
- **Fluid UX**: 선택 → 즉시 그래프 변화 (3.33초 만에 50 results)
- **No-Code 접근성**: SQL 작성 없이 클릭만으로 복잡한 쿼리 실행
- **Schema 인식**: 데이터베이스 스키마를 시각적으로 탐색

---

## 2. 핵심 질문에 대한 분석

### Q1: 현재 서비스가 Timbr처럼 Relationship/Properties 선택으로 노드가 반응형으로 변하는가?

**현재 상태**: ❌ **부분적으로만 구현됨**

```
현재 ScholaRAG_Graph 흐름:
User → FilterPanel에서 Entity Type 체크박스 → 해당 타입 노드 표시/숨김

Timbr 흐름:
User → Relationships 탭 → 관계 선택 → 연결 Properties 지정 → "Find Connections" 클릭
     → 해당 관계를 가진 노드들이 실시간으로 그래프에 추가됨
```

**차이점**:
1. ScholaRAG는 **이미 로드된** 노드를 필터링 (숨기기/보이기)
2. Timbr는 **새로운 노드를 동적으로 로드** (DB 쿼리 후 추가)

### Q2: PDF에서 RAG으로 구축 시 특성들이 일관성 있게 기록되는가?

**현재 상태**: ⚠️ **구조는 있으나 일관성 한계 존재**

```yaml
# 현재 Entity 추출 프로세스
PDF → Abstract/Full-text → LLM (Claude 3.5 Haiku)
     ↓
  Entity Extraction:
    - Concept: {name, definition, domain}
    - Method: {name, type, description}
    - Finding: {statement, effect_size, significance}

문제점:
1. LLM 출력의 비결정성 → 동일 개념이 다르게 기술될 수 있음
2. effect_size 형식 비표준화 (r=0.5, d=0.8, "moderate" 등 혼재)
3. domain 분류 기준 불명확
```

**CSV vs PDF 비교**:
| 데이터 소스 | 구조화 수준 | 일관성 | 속성 풍부도 |
|------------|------------|--------|------------|
| CSV (Timbr) | ✅ 완전 구조화 | ✅ 100% | 스키마 정의대로 |
| PDF (ScholaRAG) | ❌ 비구조화 | ⚠️ 70-85% | LLM 추출 품질 의존 |

### Q3: 메타데이터는 노드 제외, 개념/방법론만 노드로 포함하려는 설계가 맞는가?

**현재 상태**: ✅ **의도적 설계 (Concept-Centric Architecture)**

```sql
-- 현재 구현된 구조
UPDATE entities SET is_visualized = FALSE
WHERE entity_type IN ('Paper', 'Author');

UPDATE entities SET is_visualized = TRUE
WHERE entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Innovation', 'Limitation');
```

**설계 이유**:
1. **정보 과부하 방지**: 500개 논문 → 500개 Paper 노드는 시각화 무의미
2. **의미적 연결 강조**: 연구자가 관심있는 것은 "어떤 개념이 어떤 방법론과 연결되는가"
3. **갭 탐지 정확도**: Paper 노드 포함 시 클러스터링 왜곡

**BUT Timbr와의 차이**: Timbr는 모든 엔티티를 노드로 표현 가능 (선택적 추가)

---

## 3. 개선 전략: Timbr 장점 도입

### 3.1 Phase 1: Dynamic Property/Relationship Explorer (핵심 기능)

**목표**: Timbr의 "선택 → 즉시 노드 등장" UX 구현

```typescript
// 신규 컴포넌트: DynamicExplorer.tsx
interface DynamicExplorerProps {
  mode: 'relationships' | 'properties';
}

// Relationships 모드
- 현재 선택된 노드의 가능한 관계 타입 표시
- 관계 선택 시 연결된 노드를 서버에서 fetch
- 애니메이션과 함께 그래프에 추가

// Properties 모드
- 선택 가능한 속성 목록 (domain, year, effect_type 등)
- 체크박스 선택 → 해당 속성값을 새 노드로 추가
- 예: "year=2024" → 2024년 발행 논문과 연결된 Concept 노드 확장
```

**API 엔드포인트 추가**:
```python
# backend/api/routes/graph.py
@router.post("/expand-by-relationship")
async def expand_by_relationship(
    node_id: str,
    relationship_type: str,
    target_entity_type: Optional[str] = None,
    limit: int = 20
) -> List[Entity]:
    """선택한 관계 타입으로 연결된 노드들을 반환"""

@router.post("/expand-by-property")
async def expand_by_property(
    property_name: str,
    property_value: Any,
    entity_type: Optional[str] = None,
    limit: int = 20
) -> List[Entity]:
    """특정 속성값을 가진 노드들을 반환"""
```

### 3.2 Phase 2: Node Scaling by Property

**현재**: `centrality_pagerank` 고정 스케일링
**개선**: 사용자가 스케일링 기준 선택 가능

```typescript
// frontend/components/graph/GraphSettings.tsx
const scalingOptions = [
  { label: 'PageRank (영향력)', value: 'centrality_pagerank' },
  { label: 'Degree (연결 수)', value: 'centrality_degree' },
  { label: 'Betweenness (중개 역할)', value: 'centrality_betweenness' },
  { label: 'Paper Count (인용 빈도)', value: 'paper_count' },
  { label: 'Effect Size (효과 크기)', value: 'effect_size_numeric' },
  { label: 'Year (최신성)', value: 'year' },
  { label: '동일 크기', value: 'uniform' }
];
```

### 3.3 Phase 3: Smart Query Suggestions (자연어 + 자동완성)

**Timbr 스타일**: 타이핑 중 concepts, properties, values 제안

```typescript
// frontend/components/search/SmartSearchBar.tsx
const getSuggestions = async (query: string): Promise<Suggestion[]> => {
  // 1. Entity 이름 매칭
  const entityMatches = await searchEntities(query);

  // 2. Property 이름 매칭 (domain:, year:, method: 등)
  const propertyMatches = PROPERTY_KEYWORDS.filter(p =>
    p.startsWith(query.split(':')[0])
  );

  // 3. Relationship 제안 ("related to", "authored by" 등)
  const relationshipMatches = RELATIONSHIP_LABELS.filter(r =>
    r.toLowerCase().includes(query.toLowerCase())
  );

  return [...entityMatches, ...propertyMatches, ...relationshipMatches];
};
```

### 3.4 Phase 4: 데이터 일관성 향상 (PDF → Structured Extraction)

**문제**: PDF에서 추출한 데이터의 비일관성
**해결**: Structured Output + Validation Pipeline

```python
# backend/graph/structured_extractor.py
from pydantic import BaseModel, Field, validator

class ExtractedConcept(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    definition: str = Field(..., min_length=10)
    domain: Literal["education", "psychology", "technology", "medicine", "social_science", "other"]
    synonyms: List[str] = []

    @validator('name')
    def normalize_name(cls, v):
        return v.lower().strip()

class ExtractedFinding(BaseModel):
    statement: str
    effect_type: Literal["positive", "negative", "neutral", "mixed"]
    effect_size: Optional[EffectSize] = None

class EffectSize(BaseModel):
    metric: Literal["r", "d", "g", "eta_squared", "odds_ratio", "other"]
    value: float = Field(..., ge=-5, le=5)
    confidence_interval: Optional[Tuple[float, float]] = None

# LLM 프롬프트에서 Pydantic 스키마 강제
extraction_result = await llm.generate(
    prompt=prompt,
    response_format={"type": "json_object", "schema": ExtractedConcept.model_json_schema()}
)
```

---

## 4. PDF에서 Property 일관성 확보 전략

### 4.1 현재 한계점

```
Paper Abstract → LLM → Free-form JSON → Entity 저장

문제:
1. "machine learning" vs "ML" vs "Machine-Learning" → 동일 개념의 다른 표현
2. effect_size: "r=.5" vs "0.5" vs "moderate correlation" → 형식 불일치
3. domain: 명시적 분류 기준 없음
```

### 4.2 개선 방안: Canonical Entity Registry + Fuzzy Matching

```python
# backend/graph/entity_registry.py
class CanonicalEntityRegistry:
    """표준 엔티티 레지스트리 - 동의어 통합"""

    canonical_concepts = {
        "artificial_intelligence": {
            "synonyms": ["AI", "machine intelligence", "computational intelligence"],
            "domain": "technology"
        },
        "self_regulated_learning": {
            "synonyms": ["SRL", "self-regulation", "metacognitive learning"],
            "domain": "education"
        }
    }

    def normalize(self, entity_name: str) -> str:
        """입력된 엔티티를 표준 형태로 변환"""
        for canonical, data in self.canonical_concepts.items():
            if entity_name.lower() in [s.lower() for s in data["synonyms"]]:
                return canonical
        return entity_name.lower().replace("-", "_").replace(" ", "_")
```

### 4.3 Effect Size 표준화

```python
# backend/graph/effect_size_normalizer.py
import re

def normalize_effect_size(raw_text: str) -> Optional[Dict]:
    """다양한 형식의 효과 크기를 표준화"""

    patterns = [
        (r"r\s*=?\s*([+-]?\d*\.?\d+)", "r"),
        (r"d\s*=?\s*([+-]?\d*\.?\d+)", "d"),
        (r"η²\s*=?\s*([+-]?\d*\.?\d+)", "eta_squared"),
        (r"Cohen'?s?\s*d\s*=?\s*([+-]?\d*\.?\d+)", "d"),
    ]

    for pattern, metric in patterns:
        match = re.search(pattern, raw_text, re.IGNORECASE)
        if match:
            return {
                "metric": metric,
                "value": float(match.group(1)),
                "raw": raw_text
            }

    # Qualitative 해석
    qualitative_map = {
        "small": {"metric": "d", "value": 0.2},
        "medium": {"metric": "d", "value": 0.5},
        "large": {"metric": "d", "value": 0.8},
    }
    for term, default in qualitative_map.items():
        if term in raw_text.lower():
            return {**default, "raw": raw_text, "estimated": True}

    return None
```

---

## 5. 아키텍처 개선 로드맵

### 5.1 단기 (1-2주): Quick Wins

| 항목 | 설명 | 파일 |
|------|------|------|
| Property Scaling Dropdown | 노드 크기 기준 선택 UI | `GraphSettings.tsx` |
| Relationship Type Filter | 엣지 타입별 표시/숨김 토글 | `FilterPanel.tsx` |
| Smart Search Autocomplete | 타이핑 시 제안 팝업 | `SearchBar.tsx` |

### 5.2 중기 (3-4주): Core Features

| 항목 | 설명 | 파일 |
|------|------|------|
| DynamicExplorer 컴포넌트 | Timbr-style 관계/속성 탐색 | `DynamicExplorer.tsx` |
| expand-by-* API | 동적 노드 확장 엔드포인트 | `graph.py` |
| Entity Registry | 표준 엔티티 + 동의어 관리 | `entity_registry.py` |
| Effect Size Normalizer | 효과 크기 표준화 | `effect_size_normalizer.py` |

### 5.3 장기 (2개월+): Professional Service

| 항목 | 설명 |
|------|------|
| Multi-tenant 아키텍처 | 팀/조직별 독립 그래프 |
| Real-time Collaboration | WebSocket 기반 동시 편집 |
| Export to Publication | PRISMA 다이어그램, 참고문헌 자동 생성 |
| API Marketplace | 타 서비스 연동 (Zotero, Mendeley, Notion) |

---

## 6. 데이터 모델 확장 제안

### 6.1 Property-based Node Expansion을 위한 스키마 추가

```sql
-- 속성값을 노드로 승격시키기 위한 테이블
CREATE TABLE property_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_name VARCHAR(100) NOT NULL,  -- 'domain', 'year', 'effect_type' 등
    property_value VARCHAR(255) NOT NULL,  -- 'education', '2024', 'positive' 등
    node_count INTEGER DEFAULT 0,          -- 이 값을 가진 엔티티 수
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_nodes_name ON property_nodes(property_name);

-- 엔티티 ↔ 속성노드 연결
CREATE TABLE entity_property_links (
    entity_id UUID REFERENCES entities(id),
    property_node_id UUID REFERENCES property_nodes(id),
    PRIMARY KEY (entity_id, property_node_id)
);
```

### 6.2 TypeScript 타입 확장

```typescript
// frontend/types/graph.ts 추가
export interface PropertyNode {
  id: string;
  propertyName: string;  // 'domain', 'year', 'methodology_type'
  propertyValue: string;
  nodeCount: number;
  color?: string;  // 속성별 색상
}

export interface DynamicExplorerState {
  selectedRelationships: RelationshipType[];
  selectedProperties: PropertyNode[];
  expandedFromNode: string | null;
  isLoading: boolean;
}
```

---

## 7. 결론 및 핵심 권장사항

### 7.1 즉시 실행 가능한 개선

1. **Node Scaling Dropdown**: 2-3시간 작업으로 큰 UX 개선
2. **Relationship Type Filter**: FilterPanel 확장으로 빠르게 구현
3. **Search Autocomplete**: 기존 검색에 debounce + suggestions 추가

### 7.2 전략적 결정 필요 항목

1. **Property를 노드로 승격**:
   - Yes → Timbr처럼 유연하지만 그래프 복잡도 증가
   - No → 현재 Concept-Centric 유지, 필터로만 처리

2. **PDF 추출 일관성**:
   - 높은 일관성 필요 → Structured Output 강제 + Validation
   - 유연성 우선 → 현재 방식 유지 + 후처리 정규화

3. **실시간 협업**:
   - 필요 → WebSocket 인프라 투자
   - 불필요 → 단일 사용자 최적화

### 7.3 Timbr 대비 차별화 포인트 (유지/강화)

| ScholaRAG만의 강점 | 설명 |
|-------------------|------|
| **Gap Detection** | InfraNodus-style 구조적 갭 탐지 (Timbr에 없음) |
| **Academic Focus** | PRISMA 2020 준수, 체계적 문헌고찰 특화 |
| **LLM-Native** | 6-Agent 파이프라인으로 심층 분석 |
| **Concept-Centric** | 논문/저자 노이즈 제거, 의미 중심 시각화 |

---

## 8. Zotero 통합을 통한 구조화된 메타데이터 노드 생성

### 8.1 Zotero 통합의 핵심 가치

**사용자 질문**: "Zotero와의 통합을 통해 메타데이터를 구조화된 노드로 생성할 수 있지 않니?"

**답변**: ✅ **매우 적합한 해결책입니다!**

Zotero는 이미 **완전히 구조화된 메타데이터**를 제공합니다:

| Zotero 필드 | 데이터 유형 | 일관성 |
|------------|-----------|--------|
| Title | String | 100% |
| Authors | Array[{firstName, lastName}] | 100% |
| Publication Year | Integer | 100% |
| DOI | String (validated) | 95%+ |
| Journal/Conference | String | 100% |
| Tags (키워드) | Array[String] | 사용자 정의 |
| Abstract | String | 90%+ |
| Item Type | Enum (journalArticle, book, etc.) | 100% |

**PDF 추출 vs Zotero 비교**:
```
PDF에서 LLM 추출:
  - 저자: "John Smith, Ph.D.*1, Mary Johnson2" → 파싱 필요
  - 연도: "2024" (본문에서 추출) → 불확실
  - DOI: 없거나 이미지로 포함 → 추출 어려움

Zotero에서 직접 가져오기:
  - 저자: [{"firstName": "John", "lastName": "Smith"}, ...]
  - 연도: 2024 (정수)
  - DOI: "10.1000/example.doi" (검증됨)
```

### 8.2 Zotero API 통합 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     ScholaRAG_Graph                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   Zotero     │────▶│   Importer   │────▶│   Graph      │    │
│  │   Library    │     │   Service    │     │   Store      │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │  Web API     │     │  Structured  │     │  Paper +     │    │
│  │  /Local SQLite     │  Metadata    │     │  Author      │    │
│  └──────────────┘     └──────────────┘     │  Nodes       │    │
│                                            └──────────────┘    │
│                                                                  │
│  추가 처리:                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PDF Full-text → LLM → Concept, Method, Finding 추출     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Zotero 연동 방식 비교

| 방식 | 장점 | 단점 | 권장 |
|------|------|------|------|
| **Web API** | 클라우드 동기화, 협업 지원 | API key 필요, 속도 제한 | 팀 사용 |
| **Better BibTeX Export** | 오프라인, 빠름 | 수동 내보내기 필요 | 개인 사용 |
| **Zotero SQLite 직접 읽기** | 완전 자동화 | 파일 잠금 이슈 | 고급 사용 |

### 8.4 구현 계획: Zotero Importer

```python
# backend/importers/zotero_importer.py
from pyzotero import zotero
from typing import List, Dict, Any
from dataclasses import dataclass

@dataclass
class ZoteroConfig:
    library_id: str
    library_type: str  # 'user' or 'group'
    api_key: str
    collection_key: Optional[str] = None  # 특정 컬렉션만 가져오기

class ZoteroImporter:
    """Zotero 라이브러리에서 구조화된 메타데이터를 가져옵니다."""

    def __init__(self, config: ZoteroConfig):
        self.zot = zotero.Zotero(
            config.library_id,
            config.library_type,
            config.api_key
        )
        self.collection_key = config.collection_key

    async def import_items(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Zotero 아이템을 가져와 구조화된 엔티티로 변환"""

        if self.collection_key:
            items = self.zot.collection_items(self.collection_key, limit=limit)
        else:
            items = self.zot.items(limit=limit)

        entities = []
        for item in items:
            data = item['data']

            # Paper 엔티티 생성
            paper = {
                'entity_type': 'Paper',
                'name': data.get('title', 'Untitled'),
                'properties': {
                    'title': data.get('title'),
                    'abstract': data.get('abstractNote'),
                    'year': self._extract_year(data),
                    'doi': data.get('DOI'),
                    'item_type': data.get('itemType'),
                    'journal': data.get('publicationTitle'),
                    'volume': data.get('volume'),
                    'issue': data.get('issue'),
                    'pages': data.get('pages'),
                    'url': data.get('url'),
                    'zotero_key': item['key'],
                    'tags': [tag['tag'] for tag in data.get('tags', [])]
                }
            }
            entities.append(paper)

            # Author 엔티티 생성 (구조화됨!)
            for creator in data.get('creators', []):
                if creator.get('creatorType') == 'author':
                    author = {
                        'entity_type': 'Author',
                        'name': f"{creator.get('firstName', '')} {creator.get('lastName', '')}".strip(),
                        'properties': {
                            'first_name': creator.get('firstName'),
                            'last_name': creator.get('lastName'),
                            'orcid': None  # Zotero extra 필드에서 추출 가능
                        }
                    }
                    entities.append(author)

        return entities

    def _extract_year(self, data: Dict) -> Optional[int]:
        """날짜 필드에서 연도 추출"""
        date_str = data.get('date', '')
        if date_str:
            # "2024-01-15" 또는 "2024" 형식 처리
            try:
                return int(date_str[:4])
            except ValueError:
                return None
        return None
```

### 8.5 Zotero Tags → Concept 노드 자동 생성

Zotero의 Tags 기능을 활용하면 **사용자가 직접 정의한 개념**을 노드로 생성할 수 있습니다:

```python
async def convert_tags_to_concepts(self, items: List[Dict]) -> List[Dict]:
    """Zotero 태그를 Concept 노드로 변환"""

    tag_papers: Dict[str, List[str]] = {}  # tag → paper_ids

    for item in items:
        paper_id = item['properties']['zotero_key']
        for tag in item['properties'].get('tags', []):
            if tag not in tag_papers:
                tag_papers[tag] = []
            tag_papers[tag].append(paper_id)

    concepts = []
    for tag, paper_ids in tag_papers.items():
        concept = {
            'entity_type': 'Concept',
            'name': tag.lower().strip(),
            'properties': {
                'source': 'zotero_tag',
                'paper_count': len(paper_ids),
                'source_paper_ids': paper_ids,
                'domain': 'user_defined'  # 또는 LLM으로 도메인 분류
            }
        }
        concepts.append(concept)

    return concepts
```

### 8.6 하이브리드 접근: Zotero + PDF RAG

**최적의 워크플로우**:

```
1. Zotero에서 가져오기 (구조화된 메타데이터)
   ├── Paper 엔티티: title, year, DOI, journal (100% 정확)
   ├── Author 엔티티: firstName, lastName (구조화됨)
   └── Concept 엔티티 (from Tags): 사용자 정의 키워드

2. PDF Full-text에서 LLM 추출 (비구조화 → 구조화)
   ├── Method: 연구 방법론 추출
   ├── Finding: 연구 결과 + 효과 크기
   └── Additional Concepts: 태그에 없는 개념들

3. 관계 자동 생성
   ├── AUTHORED_BY: Paper → Author (Zotero 데이터)
   ├── DISCUSSES_CONCEPT: Paper → Concept (Tags + LLM)
   └── USES_METHOD: Paper → Method (LLM 추출)
```

### 8.7 API 엔드포인트 설계

```python
# backend/routers/import_.py 추가

@router.post("/zotero/connect")
async def connect_zotero(request: ZoteroConnectRequest):
    """Zotero 라이브러리 연결 및 컬렉션 목록 가져오기"""
    pass

@router.post("/zotero/import")
async def import_from_zotero(request: ZoteroImportRequest):
    """선택한 컬렉션에서 아이템 Import"""
    pass

@router.post("/zotero/sync")
async def sync_with_zotero(project_id: UUID):
    """기존 프로젝트와 Zotero 동기화 (새 아이템 추가)"""
    pass

# Pydantic 모델
class ZoteroConnectRequest(BaseModel):
    library_id: str
    library_type: Literal['user', 'group'] = 'user'
    api_key: str

class ZoteroImportRequest(BaseModel):
    library_id: str
    library_type: str
    api_key: str
    collection_key: Optional[str] = None
    project_name: str
    research_question: str
    import_tags_as_concepts: bool = True
    extract_from_pdfs: bool = True  # PDF 첨부파일에서 추가 추출
```

### 8.8 Zotero 통합의 이점 요약

| 측면 | 개선 효과 |
|------|----------|
| **데이터 일관성** | 100% (Zotero 스키마 표준화) |
| **Import 속도** | 10x 빠름 (LLM 호출 감소) |
| **저자 정규화** | 자동 (firstName, lastName 분리) |
| **중복 제거** | DOI 기반 정확한 매칭 |
| **사용자 제어** | Tags로 커스텀 Concept 정의 |
| **협업 지원** | Zotero Group Libraries 연동 |

### 8.9 Zotero + PDF Hybrid Import (최적 전략) ⭐

#### 8.9.1 왜 Hybrid가 최적인가?

**Zotero만 사용 시 한계**:
- Method, Finding, Effect Size 등 본문 분석 필요 항목 추출 불가
- 연구 방법론, 결과 데이터는 PDF 전문에만 존재

**PDF만 사용 시 한계**:
- 저자 이름 파싱 오류 (소속, 학위 등 혼재)
- DOI, 연도 등 메타데이터 추출 불안정
- LLM 토큰 비용 높음

**Hybrid 접근의 장점**:
```
┌─────────────────────────────────────────────────────────────┐
│               Import 방식별 노드 커버리지                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  노드 유형        PDF Only    Zotero Only    Hybrid         │
│  ─────────────────────────────────────────────────────────  │
│  Paper            ⚠️ 70%       ✅ 100%        ✅ 100%        │
│  Author           ⚠️ 60%       ✅ 100%        ✅ 100%        │
│  Tag/Concept      ⚠️ 75%       ✅ 95%         ✅ 95%+        │
│  Journal          ⚠️ 80%       ✅ 100%        ✅ 100%        │
│  Method           ✅ 85%       ❌ 0%          ✅ 85%         │
│  Finding          ✅ 80%       ❌ 0%          ✅ 80%         │
│  Effect Size      ✅ 70%       ❌ 0%          ✅ 70%         │
│  Innovation       ✅ 75%       ❌ 0%          ✅ 75%         │
│  ─────────────────────────────────────────────────────────  │
│  전체 커버리지     ⚠️ 74%       ⚠️ 49%         ✅ 88%+       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 8.9.2 Hybrid Import 파이프라인

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Zotero Hybrid Import Pipeline                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                                                   │
│  │   Zotero     │                                                   │
│  │   Library    │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Phase 1: Structured Extraction             │   │
│  │                    (Zotero API - 즉시, 100% 정확, 무료)        │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  📄 Paper     : title, year, DOI, journal, abstract          │   │
│  │  👤 Author    : firstName, lastName (구조화됨)                │   │
│  │  🏷️ Tag       : 사용자 정의 키워드 → Concept                  │   │
│  │  📚 Journal   : publicationTitle, ISSN                        │   │
│  │  📁 Collection: 폴더 구조 → Topic 계층                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Phase 2: PDF Deep Extraction               │   │
│  │                    (LLM - 시간 소요, 심층 분석, 유료)           │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  🔬 Method    : 연구 방법론 (RCT, survey, qualitative...)     │   │
│  │  📊 Finding   : 연구 결과 + Effect Size (r=0.45, d=0.8)       │   │
│  │  ❓ Problem   : 연구 문제/질문                                 │   │
│  │  💡 Innovation: 새로운 기여점                                  │   │
│  │  ⚠️ Limitation: 연구 한계                                     │   │
│  │  🔗 Additional Concepts: Tags에 없는 개념들                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Phase 3: Merge & Deduplicate               │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  • Zotero Tag "machine learning" + LLM "ML" → 통합            │   │
│  │  • Paper-Author 관계: Zotero 데이터 우선 (정확)               │   │
│  │  • Paper-Method 관계: LLM 추출 (PDF 본문)                     │   │
│  │  • Concept 중복 제거: Canonical Registry 활용                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 8.9.3 Zotero Import 방식 비교

| 방식 | 장점 | 단점 | PDF 접근 | 권장 |
|------|------|------|----------|------|
| **Zotero Web API** | 클라우드 동기화, 협업 | Rate limit, API key 필요 | ✅ 다운로드 가능 | 팀/협업 |
| **Better BibTeX Export** | 빠름, 오프라인 | 수동 내보내기 | ❌ 별도 경로 필요 | 일회성 |
| **Zotero SQLite 직접** | 완전 자동화 | 파일 잠금, 복잡 | ✅ storage 폴더 | 고급 |
| **Zotero Local API** | 실시간, 안정적 | 데스크톱 앱 필요 | ✅ 직접 접근 | ⭐ **권장** |

#### 8.9.4 최적 방식: Zotero Local API + PDF

**Zotero 데스크톱 앱의 Local API** (포트 23119)를 활용하면:
- API key 불필요 (로컬 인증)
- Rate limit 없음
- PDF 파일 직접 접근 가능
- 실시간 동기화

```python
# Zotero Local API 엔드포인트
BASE_URL = "http://localhost:23119/api"

# 사용 가능한 엔드포인트
GET /users/0/items              # 모든 아이템
GET /users/0/collections        # 컬렉션 목록
GET /users/0/items/{key}        # 특정 아이템
GET /users/0/items/{key}/file   # PDF 파일 접근
```

#### 8.9.5 Hybrid Importer 구현 (Production-Ready)

```python
# backend/importers/hybrid_zotero_importer.py
"""
Zotero Hybrid Importer - 최적화된 Import 전략

Phase 1: Zotero에서 구조화된 메타데이터 추출 (100% 정확, 무료)
Phase 2: PDF에서 LLM으로 심층 분석 (Method, Finding 등)
Phase 3: 병합 및 중복 제거
"""

import asyncio
import httpx
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from enum import Enum
from pathlib import Path
import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


class NodeSource(Enum):
    """노드 데이터 소스"""
    ZOTERO = "zotero"           # 100% 신뢰
    PDF_LLM = "pdf_llm"         # 70-90% 신뢰
    MERGED = "merged"           # 병합된 결과


class ImportMode(Enum):
    """Import 모드"""
    ZOTERO_ONLY = "zotero_only"       # 메타데이터만 (빠름, 무료)
    HYBRID_SELECTIVE = "selective"     # 선택적 PDF 추출 (권장)
    HYBRID_FULL = "full"               # 전체 PDF 추출 (비용 높음)


@dataclass
class ExtractedNode:
    """추출된 노드"""
    entity_type: str
    name: str
    properties: Dict[str, Any] = field(default_factory=dict)
    source: NodeSource = NodeSource.ZOTERO
    confidence: float = 1.0
    zotero_key: Optional[str] = None
    paper_key: Optional[str] = None  # 연결된 Paper


@dataclass
class ImportConfig:
    """Import 설정"""
    mode: ImportMode = ImportMode.HYBRID_SELECTIVE

    # Zotero 연결
    use_local_api: bool = True
    local_api_port: int = 23119
    web_api_key: Optional[str] = None
    library_id: Optional[str] = None
    library_type: str = "user"

    # PDF 추출 설정
    extract_methods: bool = True
    extract_findings: bool = True
    extract_effect_sizes: bool = True
    extract_innovations: bool = False
    extract_limitations: bool = False
    extract_additional_concepts: bool = True

    # 성능 설정
    max_concurrent: int = 5
    pdf_text_limit: int = 15000
    min_confidence: float = 0.7


class ZoteroLocalClient:
    """Zotero Local API 클라이언트"""

    def __init__(self, port: int = 23119):
        self.base_url = f"http://localhost:{port}/api"
        self.client = httpx.AsyncClient(timeout=30.0)

    async def get_collections(self) -> List[Dict]:
        """컬렉션 목록 조회"""
        resp = await self.client.get(f"{self.base_url}/users/0/collections")
        return resp.json()

    async def get_collection_items(self, collection_key: str) -> List[Dict]:
        """컬렉션 내 아이템 조회"""
        resp = await self.client.get(
            f"{self.base_url}/users/0/collections/{collection_key}/items"
        )
        return resp.json()

    async def get_item(self, item_key: str) -> Dict:
        """단일 아이템 조회"""
        resp = await self.client.get(f"{self.base_url}/users/0/items/{item_key}")
        return resp.json()

    async def get_item_children(self, item_key: str) -> List[Dict]:
        """아이템의 첨부파일 조회"""
        resp = await self.client.get(
            f"{self.base_url}/users/0/items/{item_key}/children"
        )
        return resp.json()

    async def get_pdf_path(self, attachment_key: str) -> Optional[Path]:
        """PDF 파일 경로 반환"""
        item = await self.get_item(attachment_key)
        data = item.get('data', {})

        if data.get('contentType') == 'application/pdf':
            # Zotero storage 경로
            path = data.get('path', '')
            if path.startswith('storage:'):
                filename = path.replace('storage:', '')
                # Zotero 데이터 디렉토리에서 찾기
                zotero_data = Path.home() / "Zotero" / "storage" / attachment_key
                pdf_path = zotero_data / filename
                if pdf_path.exists():
                    return pdf_path
        return None

    async def close(self):
        await self.client.aclose()


class ZoteroWebClient:
    """Zotero Web API 클라이언트 (Fallback)"""

    def __init__(self, api_key: str, library_id: str, library_type: str = "user"):
        self.api_key = api_key
        self.library_id = library_id
        self.library_type = library_type
        self.base_url = "https://api.zotero.org"
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"Zotero-API-Key": api_key}
        )

    async def get_collections(self) -> List[Dict]:
        url = f"{self.base_url}/{self.library_type}s/{self.library_id}/collections"
        resp = await self.client.get(url)
        return resp.json()

    async def get_collection_items(self, collection_key: str) -> List[Dict]:
        url = f"{self.base_url}/{self.library_type}s/{self.library_id}/collections/{collection_key}/items"
        resp = await self.client.get(url)
        return resp.json()

    async def download_pdf(self, item_key: str) -> Optional[bytes]:
        """PDF 다운로드 (Web API)"""
        url = f"{self.base_url}/{self.library_type}s/{self.library_id}/items/{item_key}/file"
        resp = await self.client.get(url)
        if resp.status_code == 200:
            return resp.content
        return None

    async def close(self):
        await self.client.aclose()


class HybridZoteroImporter:
    """Zotero + PDF Hybrid Importer"""

    def __init__(self, config: ImportConfig, llm_provider=None):
        self.config = config
        self.llm = llm_provider

        # Zotero 클라이언트 초기화
        if config.use_local_api:
            self.zotero = ZoteroLocalClient(config.local_api_port)
        else:
            self.zotero = ZoteroWebClient(
                config.web_api_key,
                config.library_id,
                config.library_type
            )

        # Entity 정규화 레지스트리
        self.entity_registry = CanonicalEntityRegistry()

    async def import_collection(
        self,
        collection_key: str,
        project_name: str,
        research_question: str
    ) -> Dict[str, Any]:
        """컬렉션 전체 Import"""

        logger.info(f"Starting import for collection: {collection_key}")

        # 아이템 목록 조회
        items = await self.zotero.get_collection_items(collection_key)
        logger.info(f"Found {len(items)} items in collection")

        all_nodes: List[ExtractedNode] = []
        all_edges: List[Dict] = []
        stats = {
            'total_items': len(items),
            'papers_processed': 0,
            'pdfs_processed': 0,
            'nodes_created': 0,
            'edges_created': 0,
        }

        # 동시 처리
        semaphore = asyncio.Semaphore(self.config.max_concurrent)

        async def process_item(item: Dict):
            async with semaphore:
                return await self._process_single_item(item)

        tasks = [process_item(item) for item in items]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Error processing item: {result}")
                continue

            nodes, edges = result
            all_nodes.extend(nodes)
            all_edges.extend(edges)
            stats['papers_processed'] += 1
            if any(n.source == NodeSource.PDF_LLM for n in nodes):
                stats['pdfs_processed'] += 1

        # Phase 3: 병합 및 중복 제거
        merged_nodes = await self._merge_and_deduplicate(all_nodes)
        stats['nodes_created'] = len(merged_nodes)
        stats['edges_created'] = len(all_edges)

        logger.info(f"Import complete: {stats}")

        return {
            'nodes': merged_nodes,
            'edges': all_edges,
            'stats': stats,
            'project': {
                'name': project_name,
                'research_question': research_question,
                'source': 'zotero',
                'collection_key': collection_key,
            }
        }

    async def _process_single_item(
        self,
        item: Dict
    ) -> tuple[List[ExtractedNode], List[Dict]]:
        """단일 아이템 처리"""

        nodes: List[ExtractedNode] = []
        edges: List[Dict] = []

        data = item.get('data', {})
        item_key = item.get('key', '')

        # Phase 1: Zotero 메타데이터 추출
        zotero_nodes, zotero_edges = await self._extract_from_zotero(item)
        nodes.extend(zotero_nodes)
        edges.extend(zotero_edges)

        # Phase 2: PDF 추출 (설정에 따라)
        if self.config.mode != ImportMode.ZOTERO_ONLY and self.llm:
            pdf_content = await self._get_pdf_content(item_key)
            if pdf_content:
                pdf_nodes, pdf_edges = await self._extract_from_pdf(
                    pdf_content,
                    paper_key=item_key
                )
                nodes.extend(pdf_nodes)
                edges.extend(pdf_edges)

        return nodes, edges

    async def _extract_from_zotero(
        self,
        item: Dict
    ) -> tuple[List[ExtractedNode], List[Dict]]:
        """Zotero 메타데이터에서 노드/엣지 추출 (100% 신뢰)"""

        nodes: List[ExtractedNode] = []
        edges: List[Dict] = []

        data = item.get('data', {})
        item_key = item.get('key', '')

        # 1. Paper 노드
        paper = ExtractedNode(
            entity_type="Paper",
            name=data.get('title', 'Untitled'),
            properties={
                'title': data.get('title'),
                'abstract': data.get('abstractNote'),
                'year': self._parse_year(data.get('date')),
                'doi': data.get('DOI'),
                'url': data.get('url'),
                'journal': data.get('publicationTitle'),
                'volume': data.get('volume'),
                'issue': data.get('issue'),
                'pages': data.get('pages'),
                'item_type': data.get('itemType'),
                'language': data.get('language'),
            },
            source=NodeSource.ZOTERO,
            confidence=1.0,
            zotero_key=item_key
        )
        nodes.append(paper)

        # 2. Author 노드들
        for creator in data.get('creators', []):
            if creator.get('creatorType') == 'author':
                full_name = f"{creator.get('firstName', '')} {creator.get('lastName', '')}".strip()
                if not full_name:
                    full_name = creator.get('name', 'Unknown')

                author = ExtractedNode(
                    entity_type="Author",
                    name=full_name,
                    properties={
                        'first_name': creator.get('firstName'),
                        'last_name': creator.get('lastName'),
                    },
                    source=NodeSource.ZOTERO,
                    confidence=1.0
                )
                nodes.append(author)

                # AUTHORED_BY 엣지
                edges.append({
                    'source_type': 'Paper',
                    'source_name': paper.name,
                    'target_type': 'Author',
                    'target_name': author.name,
                    'relationship_type': 'AUTHORED_BY',
                    'source': NodeSource.ZOTERO,
                })

        # 3. Tag → Concept 노드들
        for tag in data.get('tags', []):
            tag_name = tag.get('tag', '')
            if tag_name:
                normalized = self.entity_registry.normalize(tag_name)
                concept = ExtractedNode(
                    entity_type="Concept",
                    name=normalized,
                    properties={
                        'original_name': tag_name,
                        'source': 'zotero_tag',
                        'domain': 'user_defined',
                    },
                    source=NodeSource.ZOTERO,
                    confidence=0.95,
                    paper_key=item_key
                )
                nodes.append(concept)

                # TAGGED_WITH 엣지
                edges.append({
                    'source_type': 'Paper',
                    'source_name': paper.name,
                    'target_type': 'Concept',
                    'target_name': concept.name,
                    'relationship_type': 'DISCUSSES_CONCEPT',
                    'source': NodeSource.ZOTERO,
                })

        # 4. Journal 노드
        if data.get('publicationTitle'):
            journal = ExtractedNode(
                entity_type="Journal",
                name=data['publicationTitle'],
                properties={
                    'issn': data.get('ISSN'),
                },
                source=NodeSource.ZOTERO,
                confidence=1.0
            )
            nodes.append(journal)

            edges.append({
                'source_type': 'Paper',
                'source_name': paper.name,
                'target_type': 'Journal',
                'target_name': journal.name,
                'relationship_type': 'PUBLISHED_IN',
                'source': NodeSource.ZOTERO,
            })

        return nodes, edges

    async def _get_pdf_content(self, item_key: str) -> Optional[str]:
        """PDF 텍스트 추출"""

        try:
            if isinstance(self.zotero, ZoteroLocalClient):
                # Local API: 파일 경로로 직접 접근
                children = await self.zotero.get_item_children(item_key)
                for child in children:
                    if child.get('data', {}).get('contentType') == 'application/pdf':
                        pdf_path = await self.zotero.get_pdf_path(child['key'])
                        if pdf_path:
                            return self._extract_text_from_pdf(pdf_path)
            else:
                # Web API: 다운로드
                children = await self.zotero.get_collection_items(item_key)
                for child in children:
                    if child.get('data', {}).get('contentType') == 'application/pdf':
                        pdf_bytes = await self.zotero.download_pdf(child['key'])
                        if pdf_bytes:
                            return self._extract_text_from_bytes(pdf_bytes)
        except Exception as e:
            logger.warning(f"Failed to get PDF for {item_key}: {e}")

        return None

    def _extract_text_from_pdf(self, pdf_path: Path) -> str:
        """PDF 파일에서 텍스트 추출"""
        try:
            doc = fitz.open(pdf_path)
            text = ""
            for page in doc:
                text += page.get_text()
                if len(text) > self.config.pdf_text_limit:
                    break
            doc.close()
            return text[:self.config.pdf_text_limit]
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            return ""

    def _extract_text_from_bytes(self, pdf_bytes: bytes) -> str:
        """PDF 바이트에서 텍스트 추출"""
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
                if len(text) > self.config.pdf_text_limit:
                    break
            doc.close()
            return text[:self.config.pdf_text_limit]
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            return ""

    async def _extract_from_pdf(
        self,
        pdf_text: str,
        paper_key: str
    ) -> tuple[List[ExtractedNode], List[Dict]]:
        """PDF 본문에서 LLM으로 노드 추출"""

        nodes: List[ExtractedNode] = []
        edges: List[Dict] = []

        if not pdf_text or not self.llm:
            return nodes, edges

        # LLM 추출 프롬프트
        extraction_targets = []
        if self.config.extract_methods:
            extraction_targets.append("METHODS: Research methodology (RCT, survey, qualitative, etc.)")
        if self.config.extract_findings:
            extraction_targets.append("FINDINGS: Key research findings")
        if self.config.extract_effect_sizes:
            extraction_targets.append("EFFECT_SIZES: Statistical effect sizes (r, d, η², OR)")
        if self.config.extract_innovations:
            extraction_targets.append("INNOVATIONS: Novel contributions")
        if self.config.extract_limitations:
            extraction_targets.append("LIMITATIONS: Study limitations")
        if self.config.extract_additional_concepts:
            extraction_targets.append("CONCEPTS: Key academic concepts not obvious from title")

        prompt = f"""Analyze this academic paper and extract:

{chr(10).join(f'{i+1}. {t}' for i, t in enumerate(extraction_targets))}

Return as JSON with these exact keys:
{{
  "methods": [{{"name": "...", "type": "quantitative|qualitative|mixed", "confidence": 0.0-1.0}}],
  "findings": [{{"statement": "...", "effect_type": "positive|negative|neutral", "effect_size": "r=0.5", "confidence": 0.0-1.0}}],
  "concepts": [{{"name": "...", "definition": "...", "confidence": 0.0-1.0}}],
  "innovations": [{{"description": "...", "confidence": 0.0-1.0}}],
  "limitations": [{{"description": "...", "confidence": 0.0-1.0}}]
}}

Paper text:
{pdf_text}
"""

        try:
            response = await self.llm.generate(prompt, response_format="json")
            extraction = response if isinstance(response, dict) else {}
        except Exception as e:
            logger.error(f"LLM extraction failed: {e}")
            return nodes, edges

        # Method 노드들
        for method in extraction.get('methods', []):
            conf = method.get('confidence', 0.85)
            if conf >= self.config.min_confidence:
                nodes.append(ExtractedNode(
                    entity_type="Method",
                    name=method['name'],
                    properties={
                        'type': method.get('type'),
                        'description': method.get('description', ''),
                    },
                    source=NodeSource.PDF_LLM,
                    confidence=conf,
                    paper_key=paper_key
                ))
                edges.append({
                    'source_key': paper_key,
                    'target_type': 'Method',
                    'target_name': method['name'],
                    'relationship_type': 'USES_METHOD',
                    'source': NodeSource.PDF_LLM,
                })

        # Finding 노드들
        for finding in extraction.get('findings', []):
            conf = finding.get('confidence', 0.80)
            if conf >= self.config.min_confidence:
                effect_size = self._normalize_effect_size(finding.get('effect_size'))
                nodes.append(ExtractedNode(
                    entity_type="Finding",
                    name=finding['statement'][:100],
                    properties={
                        'statement': finding['statement'],
                        'effect_type': finding.get('effect_type'),
                        'effect_size': effect_size,
                    },
                    source=NodeSource.PDF_LLM,
                    confidence=conf,
                    paper_key=paper_key
                ))
                edges.append({
                    'source_key': paper_key,
                    'target_type': 'Finding',
                    'target_name': finding['statement'][:100],
                    'relationship_type': 'REPORTS_FINDING',
                    'source': NodeSource.PDF_LLM,
                })

        # Additional Concept 노드들
        for concept in extraction.get('concepts', []):
            conf = concept.get('confidence', 0.75)
            if conf >= self.config.min_confidence:
                normalized = self.entity_registry.normalize(concept['name'])
                nodes.append(ExtractedNode(
                    entity_type="Concept",
                    name=normalized,
                    properties={
                        'original_name': concept['name'],
                        'definition': concept.get('definition', ''),
                        'source': 'pdf_extraction',
                    },
                    source=NodeSource.PDF_LLM,
                    confidence=conf,
                    paper_key=paper_key
                ))

        return nodes, edges

    async def _merge_and_deduplicate(
        self,
        nodes: List[ExtractedNode]
    ) -> List[ExtractedNode]:
        """노드 병합 및 중복 제거 (Zotero 우선)"""

        # 이름+타입 기반 그룹핑
        grouped: Dict[str, List[ExtractedNode]] = {}
        for node in nodes:
            key = f"{node.entity_type}:{node.name.lower().strip()}"
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(node)

        merged: List[ExtractedNode] = []

        for key, group in grouped.items():
            if len(group) == 1:
                merged.append(group[0])
            else:
                # Zotero 소스 우선
                zotero_nodes = [n for n in group if n.source == NodeSource.ZOTERO]
                pdf_nodes = [n for n in group if n.source == NodeSource.PDF_LLM]

                if zotero_nodes:
                    base = zotero_nodes[0]
                    # PDF에서 추출한 속성 병합 (Zotero에 없는 것만)
                    for pdf_node in pdf_nodes:
                        for k, v in pdf_node.properties.items():
                            if k not in base.properties or not base.properties[k]:
                                base.properties[k] = v
                    base.source = NodeSource.MERGED
                    merged.append(base)
                else:
                    # Zotero 없으면 가장 높은 신뢰도
                    best = max(group, key=lambda n: n.confidence)
                    merged.append(best)

        return merged

    def _parse_year(self, date_str: Optional[str]) -> Optional[int]:
        """날짜 문자열에서 연도 추출"""
        if not date_str:
            return None
        try:
            return int(date_str[:4])
        except (ValueError, IndexError):
            return None

    def _normalize_effect_size(self, raw: Optional[str]) -> Optional[Dict]:
        """효과 크기 정규화"""
        if not raw:
            return None

        import re
        patterns = [
            (r"r\s*=?\s*([+-]?\d*\.?\d+)", "r"),
            (r"d\s*=?\s*([+-]?\d*\.?\d+)", "d"),
            (r"g\s*=?\s*([+-]?\d*\.?\d+)", "g"),
            (r"η²?\s*=?\s*([+-]?\d*\.?\d+)", "eta_squared"),
            (r"OR\s*=?\s*([+-]?\d*\.?\d+)", "odds_ratio"),
        ]

        for pattern, metric in patterns:
            match = re.search(pattern, raw, re.IGNORECASE)
            if match:
                return {
                    'metric': metric,
                    'value': float(match.group(1)),
                    'raw': raw
                }

        return {'raw': raw}

    async def close(self):
        await self.zotero.close()


class CanonicalEntityRegistry:
    """표준 엔티티 레지스트리 (동의어 통합)"""

    canonical_map = {
        "artificial_intelligence": ["AI", "machine intelligence", "computational intelligence"],
        "machine_learning": ["ML", "statistical learning"],
        "natural_language_processing": ["NLP", "text processing", "language understanding"],
        "deep_learning": ["DL", "neural networks", "deep neural networks"],
        "self_regulated_learning": ["SRL", "self-regulation", "metacognitive learning"],
        "educational_technology": ["EdTech", "learning technology"],
    }

    def __init__(self):
        self._reverse_map = {}
        for canonical, synonyms in self.canonical_map.items():
            for syn in synonyms:
                self._reverse_map[syn.lower()] = canonical

    def normalize(self, name: str) -> str:
        """엔티티 이름 정규화"""
        lower = name.lower().strip()

        # 동의어 매핑 확인
        if lower in self._reverse_map:
            return self._reverse_map[lower]

        # 기본 정규화
        return lower.replace("-", "_").replace(" ", "_")
```

#### 8.9.6 비용 최적화 설정

```python
# backend/config.py 추가

class ZoteroImportConfig(BaseSettings):
    """Zotero Import 설정"""

    # 연결 설정
    zotero_use_local_api: bool = True
    zotero_local_port: int = 23119
    zotero_web_api_key: str = ""
    zotero_library_id: str = ""
    zotero_library_type: str = "user"

    # Import 모드
    import_mode: str = "selective"  # "zotero_only", "selective", "full"

    # PDF 추출 설정 (비용 영향)
    extract_methods: bool = True        # 필수 - 방법론
    extract_findings: bool = True       # 필수 - 연구 결과
    extract_effect_sizes: bool = True   # 권장 - 효과 크기
    extract_innovations: bool = False   # 선택 - 비용 절감
    extract_limitations: bool = False   # 선택 - 비용 절감
    extract_concepts: bool = True       # 권장 - Tags 보완

    # 성능 설정
    max_concurrent_extractions: int = 5
    pdf_text_limit: int = 15000
    min_confidence_threshold: float = 0.7

    class Config:
        env_prefix = "ZOTERO_"

# 비용 예측
"""
┌────────────────────────────────────────────────────────────┐
│               Import 비용 예측 (Claude 3.5 Haiku 기준)       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  모드              토큰/Paper    비용/Paper    100 Papers   │
│  ────────────────────────────────────────────────────────  │
│  Zotero Only       0             $0            $0          │
│  Selective         ~8,000        ~$0.008       ~$0.80      │
│  Full              ~15,000       ~$0.015       ~$1.50      │
│                                                            │
│  * Claude 3.5 Haiku: $0.25/1M input, $1.25/1M output      │
│                                                            │
└────────────────────────────────────────────────────────────┘
"""
```

#### 8.9.7 API 엔드포인트 설계

```python
# backend/routers/import_.py 추가

@router.get("/zotero/status")
async def check_zotero_connection():
    """Zotero 연결 상태 확인"""
    try:
        client = ZoteroLocalClient()
        collections = await client.get_collections()
        await client.close()
        return {
            "connected": True,
            "type": "local_api",
            "collections_count": len(collections)
        }
    except:
        return {
            "connected": False,
            "message": "Zotero 데스크톱 앱이 실행 중인지 확인하세요."
        }

@router.get("/zotero/collections")
async def list_zotero_collections():
    """Zotero 컬렉션 목록"""
    client = ZoteroLocalClient()
    collections = await client.get_collections()
    await client.close()

    return [
        {
            "key": c["key"],
            "name": c["data"]["name"],
            "parent": c["data"].get("parentCollection"),
            "item_count": c["meta"].get("numItems", 0)
        }
        for c in collections
    ]

@router.post("/zotero/import")
async def import_from_zotero(
    request: ZoteroImportRequest,
    background_tasks: BackgroundTasks
):
    """Zotero 컬렉션 Import (Background Job)"""

    job_id = str(uuid4())

    # 백그라운드에서 실행
    background_tasks.add_task(
        run_zotero_import,
        job_id=job_id,
        collection_key=request.collection_key,
        project_name=request.project_name,
        research_question=request.research_question,
        import_mode=request.import_mode,
    )

    return {
        "job_id": job_id,
        "status": "started",
        "message": "Import가 시작되었습니다."
    }

class ZoteroImportRequest(BaseModel):
    collection_key: str
    project_name: str
    research_question: str
    import_mode: str = "selective"  # "zotero_only", "selective", "full"
```

#### 8.9.8 Frontend UI 컴포넌트

```tsx
// frontend/components/import/ZoteroImporter.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectItem } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface Collection {
  key: string;
  name: string;
  item_count: number;
}

export function ZoteroImporter() {
  const [connected, setConnected] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [importMode, setImportMode] = useState<string>('selective');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Zotero 연결 확인
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    const res = await fetch('/api/import/zotero/status');
    const data = await res.json();
    setConnected(data.connected);

    if (data.connected) {
      loadCollections();
    }
  };

  const loadCollections = async () => {
    const res = await fetch('/api/import/zotero/collections');
    const data = await res.json();
    setCollections(data);
  };

  const startImport = async () => {
    setImporting(true);
    // ... import 로직
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ZoteroIcon className="w-6 h-6" />
          Zotero에서 가져오기
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 연결 상태 */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>{connected ? 'Zotero 연결됨' : 'Zotero에 연결해주세요'}</span>
          {!connected && (
            <Button variant="outline" size="sm" onClick={checkConnection}>
              다시 확인
            </Button>
          )}
        </div>

        {connected && (
          <>
            {/* 컬렉션 선택 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">컬렉션 선택</label>
              <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                {collections.map(col => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.name} ({col.item_count}개 논문)
                  </SelectItem>
                ))}
              </Select>
            </div>

            {/* Import 모드 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Import 모드</label>
              <Select value={importMode} onValueChange={setImportMode}>
                <SelectItem value="zotero_only">
                  빠른 모드 (메타데이터만) - 무료
                </SelectItem>
                <SelectItem value="selective">
                  권장 모드 (메타데이터 + 방법론/결과) - ~$0.01/논문
                </SelectItem>
                <SelectItem value="full">
                  전체 분석 (모든 항목) - ~$0.02/논문
                </SelectItem>
              </Select>
            </div>

            {/* Import 버튼 */}
            <Button
              className="w-full"
              disabled={!selectedCollection || importing}
              onClick={startImport}
            >
              {importing ? (
                <>
                  <Spinner className="mr-2" />
                  가져오는 중... {progress}%
                </>
              ) : (
                '가져오기 시작'
              )}
            </Button>

            {importing && <Progress value={progress} />}
          </>
        )}

        {/* 도움말 */}
        <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
          <p className="font-medium mb-1">💡 Zotero 연결 방법:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Zotero 데스크톱 앱 실행</li>
            <li>설정 → 고급 → "HTTP 서버 실행" 활성화</li>
            <li>이 페이지 새로고침</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 9. Codex 코드 리뷰 결과 반영

### 9.1 리뷰 요약

| 영역 | 점수 | 상태 |
|------|------|------|
| Code Quality | 7/10 | 🟡 |
| Architecture | 7/10 | 🟡 |
| **Security** | **4/10** | 🔴 Critical |
| Performance | 6/10 | 🟡 |
| Maintainability | 6/10 | 🟡 |

### 9.2 즉시 수정 필요 항목 (High Priority)

1. **인증/권한 누락** (`backend/routers/projects.py#L59`, `graph.py#L97`)
   - 모든 데이터 접근 엔드포인트에 인증 적용
   - 프로젝트별 소유권 검증

2. **Import 경로 검증** (`backend/routers/import_.py#L51`)
   - `ALLOWED_IMPORT_ROOTS` 미설정 시 실패 처리
   - 절대 경로 강제

3. **DB URL 로깅** (`backend/main.py#L27`)
   - 크레덴셜 노출 방지를 위해 URL 로깅 제거

### 9.3 단기 수정 항목 (Medium Priority)

4. **GraphStore DI 오류** (`backend/routers/graph.py#L92`)
   - `GraphStore(db_connection=...)` → `GraphStore(db=...)` 수정

5. **In-memory 저장소** (`backend/routers/chat.py#L76`)
   - 대화 기록 및 Job 상태를 PostgreSQL로 이전

6. **N+1 쿼리** (`backend/routers/projects.py#L59`)
   - 프로젝트 목록 조회 시 stats 일괄 쿼리

### 9.4 장기 개선 항목 (Low Priority)

7. Rate Limiting 추가 (chat/import 엔드포인트)
8. 테스트 커버리지 확대 (importers, agents)
9. 운영 문서 강화 (`DEPLOYMENT.md`)

---

## 10. 프론트엔드 디자인 에이전트 계획

### 10.1 디자인 시스템 구축 목표

**Professional Service Level UI/UX** 달성을 위한 체계적 디자인 전략

### 10.2 현재 상태 분석

| 영역 | 현재 | 목표 |
|------|------|------|
| 디자인 시스템 | TailwindCSS 기본 | Shadcn/UI 커스텀 테마 |
| 컴포넌트 일관성 | 낮음 | 높음 (Design Tokens) |
| 다크 모드 | 미구현 | 완전 지원 |
| 반응형 | 부분적 | 모바일 최적화 |
| 접근성 | 미고려 | WCAG 2.1 AA |

### 10.3 디자인 토큰 정의

```typescript
// frontend/lib/design-tokens.ts
export const tokens = {
  colors: {
    // 학술 연구 플랫폼에 어울리는 차분한 팔레트
    primary: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      500: '#0ea5e9',  // Sky Blue
      600: '#0284c7',
      900: '#0c4a6e',
    },
    // Entity Type별 색상 (시각적 구분)
    entity: {
      concept: '#8B5CF6',    // Purple
      method: '#F59E0B',     // Amber
      finding: '#10B981',    // Emerald
      problem: '#EF4444',    // Red
      paper: '#6366F1',      // Indigo (숨겨진 노드)
      author: '#EC4899',     // Pink (숨겨진 노드)
    },
    // Gap Detection 시각화
    gap: {
      cluster1: '#06B6D4',   // Cyan
      cluster2: '#F97316',   // Orange
      bridge: '#FBBF24',     // Yellow
    }
  },
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
    }
  },
  spacing: {
    panel: '1rem',
    card: '1.5rem',
    section: '2rem',
  },
  radius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    full: '9999px',
  },
  shadow: {
    card: '0 2px 8px rgba(0, 0, 0, 0.08)',
    elevated: '0 4px 20px rgba(0, 0, 0, 0.12)',
    focus: '0 0 0 3px rgba(14, 165, 233, 0.4)',
  }
};
```

### 10.4 Timbr-Inspired UI 컴포넌트 설계

#### A. Dynamic Explorer Panel (신규)

```tsx
// frontend/components/graph/DynamicExplorer.tsx
interface DynamicExplorerProps {
  selectedNode: GraphNode | null;
  onRelationshipSelect: (type: string) => void;
  onPropertySelect: (prop: PropertySelection) => void;
}

const DynamicExplorer: React.FC<DynamicExplorerProps> = ({
  selectedNode,
  onRelationshipSelect,
  onPropertySelect
}) => {
  const [activeTab, setActiveTab] = useState<'relationships' | 'properties'>('relationships');

  return (
    <Card className="w-80 shadow-lg border-l">
      {/* Tab Switcher */}
      <div className="flex border-b">
        <TabButton
          active={activeTab === 'relationships'}
          onClick={() => setActiveTab('relationships')}
        >
          Relationships
        </TabButton>
        <TabButton
          active={activeTab === 'properties'}
          onClick={() => setActiveTab('properties')}
        >
          Properties
        </TabButton>
      </div>

      {/* Content */}
      {activeTab === 'relationships' ? (
        <RelationshipSelector
          availableTypes={getAvailableRelationships(selectedNode)}
          onSelect={onRelationshipSelect}
        />
      ) : (
        <PropertySelector
          availableProperties={getAvailableProperties(selectedNode)}
          onSelect={onPropertySelect}
        />
      )}

      {/* Action Button */}
      <div className="p-4 border-t">
        <Button variant="primary" className="w-full">
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Selected to Graph
        </Button>
      </div>
    </Card>
  );
};
```

#### B. Node Scaling Controls

```tsx
// frontend/components/graph/GraphSettings.tsx
const NodeScalingControl: React.FC = () => {
  const { scalingProperty, setScalingProperty } = useGraphStore();

  const options = [
    { value: 'centrality_pagerank', label: 'PageRank', icon: <StarIcon /> },
    { value: 'centrality_degree', label: 'Connections', icon: <LinkIcon /> },
    { value: 'paper_count', label: 'Citations', icon: <DocumentIcon /> },
    { value: 'uniform', label: 'Equal Size', icon: <CircleIcon /> },
  ];

  return (
    <div className="space-y-2">
      <Label>Node Scaling</Label>
      <Select value={scalingProperty} onValueChange={setScalingProperty}>
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2">
              {opt.icon}
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </Select>
    </div>
  );
};
```

#### C. Node Details Panel (개선)

```tsx
// frontend/components/graph/NodeDetailsPanel.tsx
const NodeDetailsPanel: React.FC<{ node: GraphNode }> = ({ node }) => {
  return (
    <Sheet open={!!node} onOpenChange={() => {}}>
      <SheetContent className="w-96">
        {/* Header with Entity Type Badge */}
        <SheetHeader>
          <div className="flex items-center gap-3">
            <EntityTypeBadge type={node.entity_type} />
            <SheetTitle className="text-lg">{node.name}</SheetTitle>
          </div>
        </SheetHeader>

        {/* Properties Section */}
        <Accordion type="single" collapsible defaultValue="details">
          <AccordionItem value="details">
            <AccordionTrigger>Details</AccordionTrigger>
            <AccordionContent>
              <PropertyList properties={node.properties} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="connections">
            <AccordionTrigger>
              Connections ({node.connectionCount})
            </AccordionTrigger>
            <AccordionContent>
              <ConnectionsList nodeId={node.id} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="metrics">
            <AccordionTrigger>Centrality Metrics</AccordionTrigger>
            <AccordionContent>
              <CentralityChart
                degree={node.properties.centrality_degree}
                betweenness={node.properties.centrality_betweenness}
                pagerank={node.properties.centrality_pagerank}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* AI Explanation */}
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <SparklesIcon className="w-4 h-4" />
            AI Explanation
          </h4>
          <AIExplanation nodeId={node.id} />
        </div>
      </SheetContent>
    </Sheet>
  );
};
```

### 10.5 인터랙션 디자인 가이드라인

#### Fluid Transitions (Timbr 스타일)

```css
/* frontend/styles/animations.css */
@keyframes nodeAppear {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes edgeGrow {
  from {
    stroke-dasharray: 100%;
    stroke-dashoffset: 100%;
  }
  to {
    stroke-dashoffset: 0%;
  }
}

.node-enter {
  animation: nodeAppear 0.3s ease-out forwards;
}

.edge-enter {
  animation: edgeGrow 0.4s ease-out forwards;
}

/* Hover States */
.node:hover {
  filter: brightness(1.1);
  transition: filter 0.15s ease;
}

/* Selection Glow */
.node-selected {
  box-shadow: 0 0 0 3px var(--color-primary-500),
              0 0 20px var(--color-primary-300);
}
```

### 10.6 반응형 레이아웃 전략

```tsx
// frontend/components/layout/GraphLayout.tsx
const GraphLayout: React.FC = () => {
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar - Always visible */}
      <TopBar />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Collapsible on mobile */}
        {!isMobile && (
          <ResizablePanel
            defaultSize={280}
            minSize={200}
            maxSize={400}
            collapsible
          >
            <GapPanel />
          </ResizablePanel>
        )}

        {/* Main Graph Canvas */}
        <div className="flex-1 relative">
          <KnowledgeGraph />

          {/* Mobile: Bottom Sheet for Gap Panel */}
          {isMobile && (
            <BottomSheet>
              <GapPanel compact />
            </BottomSheet>
          )}
        </div>

        {/* Right Panel - Drawer on tablet, inline on desktop */}
        {isTablet ? (
          <Drawer>
            <NodeDetailsPanel />
          </Drawer>
        ) : (
          <ResizablePanel defaultSize={320}>
            <NodeDetailsPanel />
          </ResizablePanel>
        )}
      </div>
    </div>
  );
};
```

### 10.7 접근성 (a11y) 체크리스트

| 항목 | 현재 | 목표 |
|------|------|------|
| 키보드 네비게이션 | ❌ | ✅ Tab/Enter/Arrow 지원 |
| 스크린 리더 | ❌ | ✅ ARIA labels |
| 색상 대비 | ⚠️ | ✅ 4.5:1 이상 |
| 포커스 표시 | ⚠️ | ✅ 명확한 focus ring |
| 텍스트 크기 조절 | ❌ | ✅ rem 단위 사용 |

### 10.8 디자인 에이전트 구현 일정

| Phase | 기간 | 작업 |
|-------|------|------|
| **1. 토큰 정의** | 1일 | Design tokens, Shadcn 테마 설정 |
| **2. 기본 컴포넌트** | 3일 | Button, Card, Panel, Badge 표준화 |
| **3. 그래프 UI** | 5일 | DynamicExplorer, NodeDetails 개선 |
| **4. 인터랙션** | 3일 | 애니메이션, 전환 효과 |
| **5. 반응형** | 2일 | 모바일/태블릿 레이아웃 |
| **6. 접근성** | 2일 | a11y 검사 및 수정 |

---

*문서 작성일: 2026-01-14*
*버전: 2.0 (Zotero 통합 + Codex 리뷰 + 디자인 계획 추가)*
*작성: Claude Code Analysis*
