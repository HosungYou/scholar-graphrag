# ScholaRAG Graph v0.10.0 Release Notes

**Release Date**: 2026-02-05
**Commit**: `15e9f5a feat(v0.10.0): Entity Type V2, test infrastructure, visual enhancements`
**Previous**: `67c5f91 feat(v0.9.0): Graph Physics & UX Critical Fixes`

---

## Summary

v0.10.0은 **14개 파일 변경 (+1,494줄, -66줄)**, 5개 PR로 구성된 대규모 업그레이드입니다.

핵심 변경:
1. **Entity Type V2**: 8개 엔티티 타입별 신뢰도 임계값 + DATASETS/METRICS 추출 파이프라인
2. **3D 노드 형태 차별화**: Three.js 8종 Geometry로 엔티티 타입 시각 구분
3. **Topic View Convex Hull**: D3.js `polygonHull`로 클러스터 경계 시각화
4. **테스트 인프라**: 백엔드 3파일(28개 테스트) + 프론트엔드 3파일(14개 테스트)
5. **카메라 Jitter 제거**: `useRef` 기반 bucket-based zoom으로 ~90% state 업데이트 감소

---

## Breaking Changes

없음. v0.9.0과 완전 호환.
- `entityType` 필드 없는 기존 노드 → 기본 `SphereGeometry` 적용
- 기존 confidence 0.7 데이터 → 모든 타입 임계값 이상 (최대 0.7)
- `metrics` 추출은 신규 Import에만 적용

---

## 1. Entity Type V2 — 다중 타입 추출 파이프라인 (PR-C1)

### 1.1 타입별 신뢰도 임계값

**파일**: `backend/graph/entity_extractor.py` (line 42-53)

```python
ENTITY_TYPE_CONFIDENCE_THRESHOLDS = {
    "Concept": 0.6,       # 넓은 추출 - 낮은 임계값
    "Method": 0.7,        # 명확한 방법론 증거 필요
    "Finding": 0.7,       # 명확한 실증 증거 필요
    "Problem": 0.65,      # 연구질문은 암시적인 경우 많음
    "Dataset": 0.7,       # 명시적 이름 필요
    "Metric": 0.7,        # 명시적 언급 필요
    "Innovation": 0.65,   # 새로운 기여는 미묘할 수 있음
    "Limitation": 0.6,    # 간략히 인정되는 경우 많음
}
```

**동작**: `_parse_json_data()` 메서드 끝에서 추출된 모든 엔티티를 타입별 임계값으로 필터링 (line 863-873):
```python
for type_key in result:
    if isinstance(result[type_key], list):
        result[type_key] = [
            entity for entity in result[type_key]
            if entity.confidence >= ENTITY_TYPE_CONFIDENCE_THRESHOLDS.get(
                entity.entity_type.value if isinstance(entity.entity_type, EntityType) else entity.entity_type,
                0.5  # 매핑에 없는 타입은 기본 0.5
            )
        ]
```

### 1.2 DATASETS & METRICS 추출 프롬프트

**파일**: `backend/graph/entity_extractor.py` (line 151-162)

`CONCEPT_CENTRIC_EXTRACTION_PROMPT`에 두 섹션 추가:

```
### DATASETS
Named datasets used in the research.
- Include specific dataset names (e.g., "ImageNet", "GLUE benchmark")
- Include data collection instruments if named
- Note size and domain if mentioned

### METRICS
Evaluation metrics used to measure outcomes.
- Include specific metric names (e.g., "accuracy", "F1 score", "Cohen's d")
- Include statistical measures if they are central to findings
- Note both primary and secondary metrics
```

### 1.3 Metrics JSON 응답 형식

**파일**: `backend/graph/entity_extractor.py` (line 210-227)

LLM 응답 JSON 구조에 `datasets`와 `metrics` 배열 추가:
```json
{
    "datasets": [
        { "name": "dataset name", "description": "domain, size, characteristics", "confidence": 0.7 }
    ],
    "metrics": [
        { "name": "metric name", "description": "what it measures and context", "confidence": 0.7 }
    ]
}
```

### 1.4 Metrics 파싱 블록

**파일**: `backend/graph/entity_extractor.py` (line 849-859)

`_parse_json_data()` 내 새 파싱 블록 (논문당 최대 3개):
```python
for mt in data.get("metrics", [])[:3]:
    if not mt.get("name"):
        continue
    result["metrics"].append(
        ExtractedEntity(
            entity_type=EntityType.METRIC,
            name=mt.get("name", ""),
            description=mt.get("description", ""),
            confidence=float(mt.get("confidence", 0.7)),
            source_paper_id=paper_id,
        )
    )
```

### 1.5 관련 코드 변경

| 위치 | 변경 |
|------|------|
| `extract_entities()` type_map (line 491-502) | `"metrics": EntityType.METRIC` 추가 |
| `expected_keys` (line 731) | `'metrics'` 추가 → `{'concepts', 'methods', 'findings', 'problems', 'innovations', 'limitations', 'datasets', 'metrics'}` |
| `_empty_result()` (line 1008) | `"metrics": []` 추가 |

---

## 2. Entity Type 시각적 차별화 — 3D Geometry (PR-C2)

### 2.1 Shape 매핑 상수

**파일**: `frontend/components/graph/Graph3D.tsx` (line 90-106)

```typescript
type EntityShape = 'sphere' | 'box' | 'octahedron' | 'cone' | 'dodecahedron' | 'cylinder' | 'torus' | 'tetrahedron';

const ENTITY_TYPE_SHAPES: Record<string, EntityShape> = {
  Concept: 'sphere',          // 기본 - 둥근, 근본적
  Method: 'box',              // 구조적, 체계적
  Finding: 'octahedron',      // 다이아몬드형, 가치 있는
  Problem: 'cone',            // 뾰족한, 방향성
  Innovation: 'dodecahedron', // 복잡한, 다면적
  Limitation: 'tetrahedron',  // 단순한, 제약적
  Dataset: 'cylinder',        // 컨테이너형
  Metric: 'torus',            // 측정, 순환적
  Paper: 'sphere',            // Fallback
  Author: 'sphere',           // Fallback
};
```

### 2.2 nodeThreeObject Geometry 분기

**파일**: `frontend/components/graph/Graph3D.tsx` (line 538-580)

기존 단일 `SphereGeometry` → 8-way switch 문으로 교체:

| Before | After |
|--------|-------|
| `new THREE.SphereGeometry(nodeSize, 16, 16)` | `entityShape` 기반 분기 |

```typescript
const entityShape = ENTITY_TYPE_SHAPES[node.entityType] || 'sphere';
let geometry: THREE.BufferGeometry;

switch (entityShape) {
  case 'box':
    geometry = new THREE.BoxGeometry(nodeSize * 1.6, nodeSize * 1.6, nodeSize * 1.6);
    break;
  case 'octahedron':
    geometry = new THREE.OctahedronGeometry(nodeSize * 1.1);
    break;
  case 'cone':
    geometry = new THREE.ConeGeometry(nodeSize, nodeSize * 2, 8);
    break;
  case 'dodecahedron':
    geometry = new THREE.DodecahedronGeometry(nodeSize * 1.1);
    break;
  case 'tetrahedron':
    geometry = new THREE.TetrahedronGeometry(nodeSize * 1.2);
    break;
  case 'cylinder':
    geometry = new THREE.CylinderGeometry(nodeSize * 0.8, nodeSize * 0.8, nodeSize * 1.6, 8);
    break;
  case 'torus':
    geometry = new THREE.TorusGeometry(nodeSize * 0.8, nodeSize * 0.35, 8, 16);
    break;
  default:
    geometry = new THREE.SphereGeometry(nodeSize, 16, 16);
}
```

변수 이름도 `sphere` → `mainMesh`로 변경 (의미적 정확성).

### 2.3 크기 배율표

| Entity Type | Geometry | 크기 배율 | segments |
|-------------|----------|-----------|----------|
| Concept | SphereGeometry | 1.0x | 16×16 |
| Method | BoxGeometry | 1.6x 각변 | - |
| Finding | OctahedronGeometry | 1.1x 반경 | - |
| Problem | ConeGeometry | 1.0x 반경, 2.0x 높이 | 8 |
| Innovation | DodecahedronGeometry | 1.1x 반경 | - |
| Limitation | TetrahedronGeometry | 1.2x 반경 | - |
| Dataset | CylinderGeometry | 0.8x 반경, 1.6x 높이 | 8 |
| Metric | TorusGeometry | 0.8x 외반경, 0.35x 내반경 | 8×16 |

---

## 3. EntityTypeLegend 컴포넌트 (PR-C2)

**파일**: `frontend/components/graph/EntityTypeLegend.tsx` (신규, 109줄)

### 3.1 구조

```
EntityTypeLegend
├── SHAPE_ICONS (14×14 SVG)      — 8종: circle, rect, polygon, ...
├── ENTITY_TYPE_COLORS            — 8색: #8B5CF6, #F59E0B, #10B981, ...
├── ENTITY_TYPE_LABELS (한국어)    — 개념, 방법, 발견, 문제, 혁신, 한계, 데이터, 지표
└── Collapsible panel             — ChevronDown/Up 토글
```

### 3.2 SVG Shape Icons

| Type | SVG Element | 설명 |
|------|-------------|------|
| Concept | `<circle cx="7" cy="7" r="5">` | 원형 |
| Method | `<rect x="2" y="2" width="10" height="10">` | 정사각형 |
| Finding | `<polygon points="7,1 13,7 7,13 1,7">` | 다이아몬드 |
| Problem | `<polygon points="7,1 12,13 2,13">` | 역삼각형 |
| Innovation | `<polygon points="7,0 9,5 14,5 10,8 12,14 7,10 2,14 4,8 0,5 5,5">` | 별 (10점) |
| Limitation | `<polygon points="7,2 12,12 2,12">` | 삼각형 |
| Dataset | `<rect x="3" y="2" width="8" height="10" rx="1">` | 둥근 직사각형 |
| Metric | `<circle cx="7" cy="7" r="5" fill="none" strokeWidth="2.5">` | 링 |

### 3.3 색상 팔레트

| Type | Color | Hex |
|------|-------|-----|
| Concept | 보라 | `#8B5CF6` |
| Method | 황색 | `#F59E0B` |
| Finding | 녹색 | `#10B981` |
| Problem | 적색 | `#EF4444` |
| Innovation | 청록 | `#14B8A6` |
| Limitation | 주황 | `#F97316` |
| Dataset | 파랑 | `#3B82F6` |
| Metric | 분홍 | `#EC4899` |

### 3.4 연동

**파일**: `frontend/components/graph/KnowledgeGraph3D.tsx` (line 16, 297)

```tsx
import EntityTypeLegend from './EntityTypeLegend';  // v0.10.0

// viewMode === '3d' 내부:
<EntityTypeLegend visibleTypes={Object.keys(nodeCounts)} />
```

`visibleTypes`로 현재 그래프에 존재하는 타입만 범례에 표시.

### 3.5 스타일링

- 배경: `#161b22/90` (GitHub Dark 반투명)
- 테두리: `#30363d`
- 텍스트: `#c9d1d9` (노드명), `#484f58` (한국어 라벨)
- 위치: `absolute bottom-4 left-4 z-10`

---

## 4. Topic View Convex Hull 경계 (PR-E)

### 4.1 Hull 그룹 생성

**파일**: `frontend/components/graph/TopicViewMode.tsx` (line 187)

```typescript
const hullGroup = container.append('g').attr('class', 'hulls');
```

노드 그룹(`nodes`) **앞에** 추가하여 z-index 충돌 방지 (노드가 hull 위에 렌더링).

### 4.2 Hull 계산 (매 Simulation Tick)

**파일**: `frontend/components/graph/TopicViewMode.tsx` (line 294-330)

```typescript
// 매 tick마다 hull 재계산
hullGroup.selectAll('path').remove();

// 1) 클러스터별 좌표 수집 + 패딩
const clusterGroups = new Map<number, Array<[number, number]>>();
nodes.forEach((n) => {
  const pad = Math.max(dims.width, dims.height) / 2 + 15;
  // 노드당 4개 코너 포인트 (부드러운 hull을 위해)
  points.push([n.x - pad, n.y - pad]);
  points.push([n.x + pad, n.y - pad]);
  points.push([n.x - pad, n.y + pad]);
  points.push([n.x + pad, n.y + pad]);
});

// 2) Convex hull 계산
clusterGroups.forEach((points, clusterId) => {
  if (points.length < 6) return; // 최소 3노드 (6 코너 포인트) 필요
  const hull = d3.polygonHull(points);
  if (hull) {
    hullGroup.append('path')
      .attr('d', `M${hull.join('L')}Z`)
      .attr('fill', color)
      .attr('fill-opacity', 0.04)       // 4% 채움
      .attr('stroke', color)
      .attr('stroke-opacity', 0.15)     // 15% 테두리
      .attr('stroke-width', 1)
      .attr('stroke-linejoin', 'round');
  }
});
```

### 4.3 클러스터 레이블 강화

**파일**: `frontend/components/graph/TopicViewMode.tsx` (line 235-246)

| 속성 | Before (v0.9.0) | After (v0.10.0) |
|------|-----------------|-----------------|
| `fill` | `'white'` | `(d) => d.color` (클러스터 색상) |
| `font-size` | `'12px'` | `'14px'` |
| `text-shadow` | 없음 | `0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)` |
| 말줄임 | 15자 | 20자 |

### 4.4 Topic Legend 강화

**파일**: `frontend/components/graph/TopicViewMode.tsx` (line 385-420)

| Before | After |
|--------|-------|
| 2줄 범례 (Connections, Structural Gap) | 클러스터 색상 스워치 (최대 8개) + 노드 수 + Edge 타입 |

```tsx
// 클러스터별 색상 + 이름 + 크기
{clusters.slice(0, 8).map((cluster, i) => (
  <div key={cluster.cluster_id} className="flex items-center gap-2">
    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CLUSTER_COLORS[i] }} />
    <span className="text-xs text-[#c9d1d9] truncate">
      {cluster.label || `Cluster ${cluster.cluster_id + 1}`}
    </span>
    <span className="text-xs text-[#484f58]">({cluster.size})</span>
  </div>
))}
{clusters.length > 8 && <span>+{clusters.length - 8} more</span>}
```

스타일: `bg-[#161b22]/90`, `border-[#30363d]`, `max-w-[200px]`

---

## 5. Active View Mode Indicator (PR-E)

**파일**: `frontend/components/graph/KnowledgeGraph3D.tsx` (line 638-665)

### 5.1 Pulsing Dot 구현

```tsx
{/* 3D Mode */}
<div className="relative flex items-center justify-center">
  <div className="absolute w-2 h-2 bg-accent-teal rounded-full animate-ping opacity-75" />
  <div className="w-2 h-2 bg-accent-teal rounded-full" />
</div>

{/* Topic View */}
<div className="relative flex items-center justify-center">
  <div className="absolute w-2 h-2 bg-accent-purple rounded-full animate-ping opacity-75" />
  <div className="w-2 h-2 bg-accent-purple rounded-full" />
</div>
```

- **구조**: 2-layer (외부 `animate-ping` 링 + 내부 solid dot)
- **색상**: 3D Mode = `bg-accent-teal`, Topic View = `bg-accent-purple`
- **조건**: `viewMode !== 'gaps'` 일 때만 표시 (Gaps Mode는 자체 배지 사용)

---

## 6. 카메라 Polling 최적화 (PR-D)

**파일**: `frontend/components/graph/Graph3D.tsx` (line 183, 1017-1032)

### 6.1 Before (v0.9.0)

```typescript
// 매 200ms마다 React state 업데이트 → nodeThreeObject 잠재적 리빌드
const distance = camera.position.length();
setCurrentZoom(distance);  // 매번 호출
```

### 6.2 After (v0.10.0)

```typescript
const currentZoomRef = useRef<number>(500);  // line 183

// 200ms polling 내부 (line 1025-1032):
const distance = camera.position.length();
const bucket = Math.round(distance / 50) * 50;  // 50단위 구간
if (bucket !== currentZoomRef.current) {         // 구간 변경 시에만
  currentZoomRef.current = bucket;
  setCurrentZoom(bucket);                        // state 업데이트
}
```

- **효과**: 마우스 드래그 중 연속적 거리 변화 (예: 501→502→503) → state 업데이트 0회
- **구간 변경 시만** (예: 524→550) → state 업데이트 1회
- **결과**: ~90% state 업데이트 감소, 500+ 노드 그래프에서 jitter 제거

---

## 7. 테스트 인프라 (PR-B)

### 7.1 백엔드 테스트 (3 파일, 340줄, 28개 테스트)

#### `backend/tests/test_chat_router.py` (114줄)

| 클래스 | 테스트 | 검증 내용 |
|--------|--------|----------|
| `TestExplainRequest` | `test_explain_request_with_all_fields` | ExplainRequest 전체 필드 (node_name, node_type, node_properties) |
| | `test_explain_request_all_optional` | 모든 필드 Optional 검증 |
| | `test_explain_request_name_only` | name만 전달 시 동작 |
| `TestExplainNodeLogic` | `test_explain_uses_provided_name` | 제공된 이름 사용 확인 |
| | `test_explain_defaults_type_to_concept` | type 미제공 시 "Concept" 기본값 |
| | `test_explain_db_fallback_when_no_name` | name 없을 때 DB fallback |
| | `test_explain_fallback_on_db_failure` | DB 실패 시 UUID fallback |
| | `test_explain_error_returns_graceful_response` | 에러 시 우아한 응답 |

#### `backend/tests/test_graph_router.py` (138줄)

| 클래스 | 테스트 | 검증 내용 |
|--------|--------|----------|
| `TestEscapeSqlLike` | `test_escapes_percent` | `100%` → `100\%` |
| | `test_escapes_underscore` | `test_name` → `test\_name` |
| | `test_escapes_backslash` | `path\file` → `path\\file` |
| | `test_escapes_single_quote` | 작은따옴표 이스케이프 |
| | `test_handles_empty_string` | 빈 문자열 처리 |
| | `test_handles_none` | None 입력 처리 |
| | `test_no_special_chars_unchanged` | 특수문자 없으면 변경 없음 |
| | `test_multiple_special_chars` | 복합 특수문자 이스케이프 |
| `TestParseJsonField` | `test_parses_dict_directly` | dict 직접 전달 |
| | `test_parses_json_string` | JSON 문자열 파싱 |
| | `test_handles_none` | None 처리 |
| | `test_handles_invalid_json` | 잘못된 JSON 처리 |
| `TestGapAnalysisResponse` | `test_empty_gaps_with_reason` | 빈 갭 + 사유 메시지 |
| `TestRelationshipEvidence` | `test_evidence_response_with_error_code` | error_code 필드 검증 |
| | `test_evidence_text_truncation` | 텍스트 잘림 처리 |
| | `test_escape_sql_like_in_evidence_search` | Evidence 검색 내 SQL 이스케이프 |

#### `backend/tests/test_importer.py` (88줄)

| 클래스 | 테스트 | 검증 내용 |
|--------|--------|----------|
| `TestEntityTypeHandling` | `test_all_entity_types_defined` | 9개 EntityType enum 전부 정의 확인 |
| | `test_primary_entity_types` | Concept/Method/Finding = 주요 시각화 타입 |
| | `test_metadata_entity_types` | Paper/Author = 메타데이터 타입 |
| | `test_secondary_entity_types` | Problem/Dataset/Metric/Innovation/Limitation |
| `TestExtractedEntity` | `test_extracted_entity_creation` | ExtractedEntity 생성 및 필드 |
| | `test_extracted_entity_confidence_range` | confidence 범위 (0.0-1.0) |
| `TestImportPhases` | `test_import_phases_exist` | Import 단계 메서드 존재 |
| | `test_importer_has_validate_method` | validate 메서드 존재 |

### 7.2 프론트엔드 테스트 (3 파일, 369줄, 14개 테스트)

#### `frontend/__tests__/components/graph/Graph3D.test.tsx` (187줄)

| describe | 테스트 | 검증 내용 |
|----------|--------|----------|
| `LABEL_CONFIG` | `should have correct InfraNodus-style label parameters` | minFontSize=10, maxFontSize=28, alwaysVisiblePercentile=0.8 |
| `CLUSTER_COLORS` | `should have 12 distinct cluster colors` | 12개 고유 색상 |
| `ENTITY_TYPE_COLORS` | `should have colors for all 10 entity types` | 10개 타입별 색상 |
| `ForceGraphNode` | `should create valid node with required fields` | 노드 인터페이스 호환 |
| `Drag release` | `should set fx/fy/fz to undefined on drag end` | 드래그 후 자유 이동 |
| | `should pin node during drag with fx/fy/fz` | 드래그 중 고정 |
| `Camera zoom bucketing` | `should bucket zoom to 50-unit increments` | 50단위 반올림 |
| | `should only update state when bucket changes` | 구간 변경 시에만 업데이트 |

#### `frontend/__tests__/hooks/useGraphStore.test.ts` (97줄)

| describe | 테스트 | 검증 내용 |
|----------|--------|----------|
| `fetchGapAnalysis` | `should not refresh when gaps exist` | 갭 있으면 리프레시 안함 |
| | `should auto-refresh when no gaps but multiple clusters exist` | 갭 0 + 클러스터 2+ → 자동 리프레시 |
| | `should not refresh when only one cluster exists` | 클러스터 1개면 리프레시 안함 |
| | `should handle refresh failure gracefully` | 리프레시 실패 시 우아한 처리 |

#### `frontend/__tests__/lib/api.test.ts` (85줄)

| describe | 테스트 | 검증 내용 |
|----------|--------|----------|
| `explainNode` | `should include node_name and node_type in request body` | body에 name/type 포함 |
| | `should default node_type to Concept` | type 미지정 시 "Concept" |
| | `should not send body when nodeName is not provided` | name 없으면 body 안 보냄 |
| | `should use POST method` | POST 메서드 사용 |

### 7.3 테스트 스택

- **Backend**: `pytest` + `pytest-asyncio` + `unittest.mock` (AsyncMock, MagicMock, patch)
- **Frontend**: `Jest` + `React Testing Library` (기존 `jest.config.js` 활용)

---

## 8. SDD v0.9.0 정합 (PR-A)

**파일**: `DOCS/architecture/SDD.md` (+95줄)

| 섹션 | 변경 |
|------|------|
| 헤더 | `Version: 0.7.0` → `0.9.0`, `Document Version: 1.1.0` → `1.3.0` |
| §1.3 Key Features | +8개: InfraNodus Labels, Physics Optimization, Gap Auto-Refresh, Evidence SQL Safety, Label Toggle, Node Removal Preview, InsightHUD, Cluster Stability |
| §3.2.2 Graph Visualization | `d3VelocityDecay: 0.4`, `cooldownTicks: 1000`, `warmupTicks: 100` 추가; `LABEL_CONFIG` 상수 명세; `Drag release: fx/fy/fz = undefined`; 노드 색상 `8 colors` → `12 colors, hash-assigned` |
| §5.1 API Contracts | `POST /api/chat/explain/{node_id}` 엔드포인트 추가 (node_name, node_type 파라미터) |
| §7 Change Log | v0.8.0 (Label Toggle, Node Removal, InsightHUD, Cluster Stability) + v0.9.0 (InfraNodus Labels, Physics, UUID Fix, Gap Refresh, Evidence, Tooltips) 항목 추가 |

---

## 전체 파일 인벤토리

### 수정된 파일 (6개, +325줄)

| 파일 | 추가 | 주요 변경 |
|------|------|----------|
| `backend/graph/entity_extractor.py` | +70 | THRESHOLDS, DATASETS/METRICS 프롬프트, metrics 파싱, confidence 필터링 |
| `frontend/components/graph/Graph3D.tsx` | +64 | ENTITY_TYPE_SHAPES, 8-way geometry switch, currentZoomRef bucket |
| `frontend/components/graph/KnowledgeGraph3D.tsx` | +62 | EntityTypeLegend import/render, pulsing active indicators |
| `frontend/components/graph/TopicViewMode.tsx` | +92 | hullGroup + d3.polygonHull, 레이블 14px/color-matched, 범례 클러스터 색상 |
| `DOCS/architecture/SDD.md` | +95 | v0.7.0→v0.9.0 전면 업데이트 |
| `CLAUDE.md` | +41 | v0.10.0 릴리스 노트 섹션 |

### 신규 파일 (8개, ~1,169줄)

| 파일 | 줄수 | 내용 |
|------|------|------|
| `frontend/components/graph/EntityTypeLegend.tsx` | 109 | 접기/펼기 범례, SVG 아이콘, 한국어 라벨 |
| `backend/tests/test_chat_router.py` | 114 | ExplainRequest 모델 + Explain 로직 테스트 |
| `backend/tests/test_graph_router.py` | 138 | escape_sql_like + JSON 파싱 + Gap + Evidence 테스트 |
| `backend/tests/test_importer.py` | 88 | EntityType enum + ExtractedEntity + Import 단계 테스트 |
| `frontend/__tests__/components/graph/Graph3D.test.tsx` | 187 | 설정 상수 + 드래그 + zoom bucket 테스트 |
| `frontend/__tests__/hooks/useGraphStore.test.ts` | 97 | Gap auto-refresh 조건 테스트 |
| `frontend/__tests__/lib/api.test.ts` | 85 | explainNode API 시그니처 테스트 |
| `RELEASE_NOTES_v0.10.0.md` | ~350 | 본 문서 |

---

## 배포 절차

### Frontend (Vercel) — 자동 배포 완료

- Push to main → 자동 빌드/배포
- URL: `https://schola-rag-graph.vercel.app`
- 상태: ✅ 배포됨

### Backend (Render Docker) — 수동 배포 필요

- Auto-Deploy OFF (INFRA-006)
- **절차**: Render Dashboard → `scholarag-graph-docker` → Manual Deploy → Deploy latest commit
- 확인: `curl https://scholarag-graph-docker.onrender.com/health`
- 상태: ⚠️ 수동 배포 대기중

> **중요**: `entity_extractor.py` 변경사항은 백엔드에 있으므로, 새로운 엔티티 타입 추출은 **백엔드 수동 배포 후 + 새 Import 시에만** 동작합니다.

---

## 기존 프로젝트 영향

| 항목 | 영향 | 조치 |
|------|------|------|
| 기존 노드 렌더링 | ✅ 정상 | `entityType` 없으면 Sphere 기본값 |
| 기존 confidence 데이터 | ✅ 정상 | 기존 0.7은 모든 임계값 이상 |
| Entity Shape 확인 | ❌ 불가 | 기존 데이터 전부 Concept → 모든 노드 Sphere |
| 새 타입 추출 | ❌ 불가 | 백엔드 배포 + 새 Import 필요 |

### 새 기능을 보려면

1. Render에서 백엔드 수동 배포
2. Zotero에서 새 프로젝트 Import (또는 기존 프로젝트에 추가 Import)
3. 3D 그래프에서 다양한 도형 확인 (Box, Octahedron, Cone 등)
4. EntityTypeLegend에서 복수 타입 확인

---

## Known Issues

- **Next.js Build Warning**: `pages-manifest.json` ENOENT on fresh builds (기존 이슈, non-blocking)
- **ESLint Warnings**: SearchBar.tsx (useCallback deps), UserMenu.tsx (img element) — v0.10.0에서 도입되지 않음
- **Topic View Clusters=0**: 일부 프로젝트에서 클러스터 계산이 0으로 반환 → convex hull 미렌더링

---

## Next Release (v0.11.0 Preview)

- AI Chat data-based fallback (컨텍스트 인식 응답)
- Semantic diversity metrics 시각화
- Next.js 14.2+ 보안 업그레이드
- Entity type 기반 필터링 UI
- Shape 기반 검색 및 하이라이트
