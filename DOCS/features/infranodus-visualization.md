# InfraNodus-Style Visualization

> **Version**: 0.2.0
> **Status**: Implemented
> **Reference**: [InfraNodus](https://infranodus.com/)

---

## Overview

InfraNodus 스타일 시각화 기능은 Knowledge Graph에서 **구조적 빈틈(Structural Gaps)**을 시각적으로 탐색할 수 있게 합니다.

### Key Features

1. **Ghost Edge Visualization**: 클러스터 간 잠재적 연결을 점선으로 표시
2. **Cluster-Based Edge Coloring**: 클러스터 멤버십에 따른 엣지 색상 구분
3. **Insight HUD**: 실시간 그래프 품질 메트릭 표시
4. **Main Topics Panel**: 클러스터 비율 시각화 및 인터랙션

---

## 1. Ghost Edge Visualization

### 개념

**Ghost Edge**는 현재 연결되지 않았지만 **의미론적으로 유사한** 개념 쌍을 점선으로 표시합니다. 이는 연구자가 "빠진 연결"을 발견하고 새로운 연구 방향을 찾는 데 도움을 줍니다.

### 작동 방식

```
Cluster A                    Cluster B
┌─────────┐                  ┌─────────┐
│ Node A1 │╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌►│ Node B1 │
│ Node A2 │                  │ Node B2 │
│ Node A3 │╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌►│ Node B3 │
└─────────┘                  └─────────┘
          Ghost Edges (점선)
```

### 사용 방법

1. **Gap Panel**에서 Structural Gap 선택
2. 자동으로 관련 Ghost Edge가 점선으로 표시됨
3. 점선의 투명도는 유사도에 비례 (높을수록 진함)

### 기술 세부사항

- **유사도 계산**: Cosine similarity between concept embeddings
- **임계값**: `min_similarity = 0.3`
- **최대 표시 수**: Gap당 5개
- **색상**: Amber (`#FFAA00`)

```typescript
// Three.js LineDashedMaterial
const material = new THREE.LineDashedMaterial({
  color: 0xffaa00,
  dashSize: 3,
  gapSize: 2,
  opacity: 0.4 + similarity * 0.4,
  transparent: true,
});
```

---

## 2. Cluster-Based Edge Coloring

### 개념

엣지 색상이 연결된 노드의 **클러스터 멤버십**을 반영합니다. 이를 통해 클러스터 구조를 직관적으로 파악할 수 있습니다.

### 색상 규칙

| Edge Type | Color | Opacity |
|-----------|-------|---------|
| 같은 클러스터 내 | 클러스터 색상 | 35% |
| 다른 클러스터 간 | 블렌딩 색상 | 15% |
| Ghost Edge | Amber | 40-80% |
| Highlighted | Gold | 80% |

### 클러스터 색상 팔레트

```typescript
const CLUSTER_COLORS = [
  '#FF6B6B', // Coral Red
  '#4ECDC4', // Turquoise
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Soft Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
  '#F8B500', // Amber
  '#82E0AA', // Light Green
];
```

### 헬퍼 함수

```typescript
// Hex to RGBA 변환
hexToRgba(hex: string, alpha: number): string

// 두 색상 블렌딩
blendColors(color1: string, color2: string, ratio: number): string

// 노드 → 클러스터 매핑
nodeClusterMap: Map<string, number>
```

---

## 3. Insight HUD

### 개념

**Insight HUD (Heads-Up Display)**는 그래프 품질 메트릭을 실시간으로 표시합니다. 연구자가 Knowledge Graph의 구조적 특성을 빠르게 파악할 수 있습니다.

### UI 위치

좌측 하단 (Collapsible)

### 표시 메트릭

| Metric | Description | Good Value |
|--------|-------------|------------|
| **Modularity** | 클러스터 분리 품질 | 0.4-0.7 |
| **Diversity** | 클러스터 크기 균형 | > 0.5 |
| **Density** | 연결 밀도 | Context-dependent |

### 통계 그리드

- **Nodes**: 총 노드 수
- **Edges**: 총 엣지 수
- **Clusters**: 클러스터 수
- **Components**: 연결 컴포넌트 수

### API

```
GET /api/graph/metrics/{project_id}

Response:
{
  "modularity": 0.65,
  "diversity": 0.82,
  "density": 0.12,
  "avg_clustering": 0.45,
  "num_components": 3,
  "node_count": 150,
  "edge_count": 420,
  "cluster_count": 5
}
```

### 메트릭 계산

```python
# Modularity (NetworkX)
modularity = nx.algorithms.community.quality.modularity(G, communities)

# Diversity (Normalized entropy)
diversity = -sum(p * log(p) for p in cluster_sizes) / log(num_clusters)

# Density
density = 2 * num_edges / (num_nodes * (num_nodes - 1))
```

---

## 4. Main Topics Panel

### 개념

**Main Topics Panel**은 InfraNodus 스타일로 클러스터 비율을 시각화합니다. 연구자가 어떤 주제가 Knowledge Graph에서 큰 비중을 차지하는지 한눈에 파악할 수 있습니다.

### UI 위치

좌측 하단 (Insight HUD 위)

### Features

1. **퍼센티지 바**: 각 클러스터의 상대적 크기
2. **색상 인디케이터**: 클러스터 색상 표시
3. **레이블**: 클러스터 이름
4. **Hover 인터랙션**: 해당 클러스터 노드 하이라이트
5. **Click 인터랙션**: 카메라 포커스 이동

### 인터랙션 흐름

```
┌─────────────────────────────────────┐
│ Main Topics              (3)        │
├─────────────────────────────────────┤
│ ● AI Chatbots          ████████ 42% │  ← Hover: Highlight nodes
│ ● Language Learning    █████░░░ 28% │  ← Click: Focus camera
│ ● Educational Tech     ███░░░░░ 30% │
├─────────────────────────────────────┤
│ Total Concepts                  150 │
└─────────────────────────────────────┘
```

---

## UI Controls

### 토글 버튼 (Top-Right Control Bar)

| Icon | Component | Default |
|------|-----------|---------|
| `BarChart3` | Insight HUD | ON |
| `PieChart` | Main Topics | OFF |

### 키보드 단축키 (Future)

| Key | Action |
|-----|--------|
| `I` | Toggle Insight HUD |
| `M` | Toggle Main Topics |
| `G` | Toggle Ghost Edges |

---

## 5. View Modes (InfraNodus Multi-Perspective Visualization)

ScholaRAG_Graph는 **3가지 상호 보완적인 뷰 모드**를 제공하여 Knowledge Graph를 다각도에서 탐색할 수 있습니다. 사용자는 상황에 맞는 뷰를 선택하여 연구 인사이트를 도출할 수 있습니다.

### 5.1. 3D Mode (기본값)

#### 개념

**3D Mode**는 전체 Knowledge Graph를 3D 공간에 렌더링합니다. 노드 간 연결 강도와 공간적 위치를 통해 전체 그래프 구조를 직관적으로 파악할 수 있습니다.

#### 기술 스택

- **렌더링**: Three.js + react-force-graph-3d
- **물리 시뮬레이션**: Force-directed layout
- **색상**: 클러스터 멤버십에 따른 색상 지정
- **아이콘**: <Box className="w-4 h-4" /> (Box icon)

#### 주요 기능

- **Force-directed layout**: 노드가 자동으로 최적 위치로 배치
- **3D 인터랙션**: 마우스 드래그로 자유로운 회전/줌/팬
- **Ghost Edges**: 구조적 빈틈을 점선으로 표시
- **Bloom Effect**: 노드에 네온 효과 적용 (선택사항)
- **Particle System**: 배경에 움직이는 입자 표시 (선택사항)
- **Node Details**: 노드 클릭 시 상세 정보 표시

#### UI 상호작용

```
Top-Right Control Bar
├─ 3D (활성)
├─ Particle Toggle (⚡ / ⚡ Off)
├─ Bloom Toggle (☀️ / ☀️ Dim)
├─ Reset Camera (↻)
├─ Legend (ℹ️)
├─ Gap Panel (✨)
├─ Centrality Panel (✂️)
├─ Cluster Panel (Ξ)
├─ Insight HUD (📊)
├─ Main Topics (🥧)
└─ View Mode Selector
   ├─ 3D (활성, Teal)
   ├─ Topics (Purple)
   └─ Gaps (Amber)

Left-Bottom Panels
├─ Legend (Entity types & counts)
├─ Main Topics Panel (클러스터 퍼센티지)
└─ Insight HUD (그래프 메트릭)
```

#### 데이터 플로우

```
Graph3D.tsx
├─ Input Props
│  ├─ nodes: GraphEntity[]
│  ├─ edges: GraphEdge[]
│  ├─ clusters: ConceptCluster[]
│  ├─ centralityMetrics: CentralityMetrics[]
│  ├─ highlightedNodes: string[]
│  ├─ selectedGap: StructuralGap
│  └─ bloomEnabled: boolean
├─ Internal State
│  ├─ nodePositions (Three.js)
│  ├─ ghostEdges (ForceGraph)
│  └─ selectedNode: GraphEntity
└─ Output Events
   ├─ onNodeClick
   ├─ onNodeHover
   ├─ onBackgroundClick
   └─ onEdgeClick
```

#### 성능 최적화

- **LOD (Level of Detail)**: Centrality 기반 노드 필터링
- **Max Nodes**: 5000+ 노드 지원
- **Ghost Edges**: 클러스터당 최대 5개 표시

#### 파일 위치

- `frontend/components/graph/Graph3D.tsx` - 3D 렌더링 컴포넌트
- `frontend/hooks/useGraph3DStore.ts` - 3D 상태 관리

---

### 5.2. Topic View Mode (2D 클러스터 뷰)

#### 개념

**Topic View Mode**는 D3.js를 사용하여 클러스터를 2D 블록으로 간략화하여 표시합니다. 복잡한 3D 그래프를 단순화하여 주요 주제 간의 관계와 비중을 파악하기 쉽게 합니다.

#### 기술 스택

- **렌더링**: D3.js + SVG
- **물리 시뮬레이션**: D3 Force-directed layout
- **색상**: 클러스터별 고유 색상 (Palette from CLUSTER_COLORS)
- **아이콘**: <Grid2X2 className="w-4 h-4" /> (Grid icon)

#### UI 다이어그램

```
┌──────────────────────────────────────────┐
│                                          │
│  ┌──────────┐     ┌──────────┐          │
│  │          │     │          │          │
│  │ Cluster  │╌╌╌╌►│ Cluster  │          │
│  │    A     │     │    B     │          │
│  │ (42%)    │     │ (28%)    │          │
│  └──────────┘     └──────────┘          │
│         ╲              ╱                 │
│          ╲            ╱                  │
│       ┌──────────┐                       │
│       │ Cluster  │                       │
│       │    C     │                       │
│       │ (30%)    │                       │
│       └──────────┘                       │
│                                          │
│  Connection Lines (solid)                │
│  Gap Links (dashed)                      │
│                                          │
└──────────────────────────────────────────┘
```

#### 주요 기능

| 기능 | 설명 |
|------|------|
| **2D 블록 렌더링** | 각 클러스터를 사각형 블록으로 표시 |
| **크기 비례** | 블록 크기 = 클러스터 내 개념 수 |
| **연결선** | 클러스터 간 실제 연결 (실선) |
| **Gap 링크** | 구조적 빈틈 (점선) |
| **Force Simulation** | D3 포스 알고리즘으로 자동 레이아웃 |
| **클릭 상호작용** | 클러스터 클릭 시 3D 뷰에서 포커스 |
| **Hover 하이라이트** | 클러스터 호버 시 관련 노드 강조 |

#### 데이터 구조

```typescript
// TopicNode (클러스터 기반)
interface TopicNode {
  id: string;                    // "cluster-{id}"
  clusterId: number;
  label: string;                 // 클러스터 이름
  size: number;                  // 개념 개수
  color: string;                 // 클러스터 색상
  conceptIds: string[];
  conceptNames: string[];
  density: number;               // 클러스터 내부 연결 밀도
}

// TopicLink (연결 또는 Gap)
interface TopicLink {
  id: string;
  source: string;                // "cluster-{id}"
  target: string;                // "cluster-{id}"
  type: 'connection' | 'gap';
  weight: number;                // 연결 강도 또는 Gap 강도
  connectionCount?: number;
}
```

#### D3 시뮬레이션 설정

```typescript
const simulation = d3.forceSimulation(topicNodes)
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(d => d.radius + 20));
```

#### 사용 시나리오

- 주요 연구 주제의 비중 파악
- 주제 간 관계의 고수준 이해
- 구조적 갭의 위치 파악
- 프레젠테이션 및 보고서용 다이어그램

#### 파일 위치

- `frontend/components/graph/TopicViewMode.tsx` - Topic View 컴포넌트
- `frontend/hooks/useGraph3DStore.ts` - viewMode 상태 관리

---

### 5.3. Gaps View Mode (구조적 빈틈 탐색)

#### 개념

**Gaps View Mode**는 InfraNodus 스타일 분석에 특화된 모드로, 구조적 빈틈을 시각적으로 탐색하고 브릿지 개념을 발견할 수 있습니다. 사용자가 연구의 새로운 방향을 찾는 데 도움을 줍니다.

#### 기술 스택

- **렌더링**: Three.js + react-force-graph-3d
- **Ghost Edges**: 클러스터 간 잠재적 연결 (점선)
- **색상**: Amber (#F8B500) - Gap 강조
- **아이콘**: <Sparkles className="w-4 h-4" /> (Sparkles icon)

#### 주요 기능

| 기능 | 설명 |
|------|------|
| **Gap 패널** | 왼쪽 사이드바에서 구조적 갭 목록 표시 |
| **Ghost Edge 시각화** | 관련 갭의 점선 강조 |
| **Bridge Candidates** | AI가 제안하는 연결 가능한 개념 |
| **Dim Inactive Nodes** | 선택된 갭과 관련 없는 노드 투명화 |
| **Bridge Glow** | 브릿지 후보 노드에 특별한 글로우 효과 |

#### Gaps View Mode 구조

```typescript
interface GapsViewModeProps {
  nodes: GraphEntity[];
  edges: GraphEdge[];
  clusters: ConceptCluster[];
  centralityMetrics: CentralityMetrics[];
  gaps: StructuralGap[];              // 모든 구조적 갭
  selectedGap: StructuralGap | null;  // 현재 선택된 갭
  onGapSelect: (gap: StructuralGap | null) => void;
  projectId: string;
  config?: Partial<GapsViewConfig>;
  bloomEnabled?: boolean;
}
```

#### Gap 선택 흐름

```
Gap Panel (왼쪽)
└─ Structural Gaps List
   └─ Click Gap
      ├─ Highlight Cluster A concepts (파란색)
      ├─ Highlight Cluster B concepts (빨간색)
      ├─ Highlight Bridge candidates (노란색 글로우)
      ├─ Show Ghost Edges (점선)
      └─ Update GapQueryPanel
         └─ AI Bridge hypothesis generation
```

#### 구조적 갭의 정의

```typescript
interface StructuralGap {
  id: string;
  cluster_a_id: number;
  cluster_b_id: number;
  cluster_a_concepts: string[];      // Cluster A의 개념들
  cluster_b_concepts: string[];      // Cluster B의 개념들
  gap_strength: number;               // 갭의 강도 (0.0 - 1.0)
  bridge_candidates: string[];        // AI가 제안하는 브릿지 개념
  potential_edges: PotentialEdge[];  // 잠재적 연결
  created_at: string;
  updated_at: string;
}
```

#### Ghost Edge 색상 규칙

| Edge 유형 | 색상 | 투명도 | 의미 |
|-----------|------|--------|------|
| 같은 클러스터 내 | 클러스터 색상 | 35% | 내부 연결 |
| 다른 클러스터 간 | 블렌딩 색상 | 15% | 약한 연결 |
| Ghost Edge (Gap) | Amber (#F8B500) | 40-80% | 잠재적 연결 |
| 선택된 Gap | Gold | 80% | 강조 상태 |

#### 인터랙션 흐름

```
User Actions:
│
├─ Click "3D Mode" → Switch to 3D View
├─ Click "Topic Mode" → Switch to Topic View
├─ Click "Gaps Mode" → Switch to Gaps View (현재 모드)
│
├─ Select Gap from panel
│  └─ Nodes highlight (A 클러스터, B 클러스터, 브릿지)
│  └─ Camera focus on gap
│  └─ Ghost edges visible
│
├─ Hover on Gap → Preview
├─ Click Bridge Hypothesis → AI analysis
└─ Click Node → Show node details
```

#### 설정 (GapsViewConfig)

```typescript
interface GapsViewConfig {
  selectedGapId: string | null;
  showAllGaps: boolean;              // 모든 gap 동시 표시
  highlightBridges: boolean;         // 브릿지 후보 강조
  dimInactiveNodes: boolean;         // 비활성 노드 투명화
  inactiveOpacity: number;           // 비활성 노드 투명도 (0.2)
  bridgeGlowIntensity: number;       // 브릿지 글로우 강도 (1.5)
}
```

#### 사용 시나리오

- 연구 문헌의 미충족 연결 발견
- 새로운 연구 질문 수립
- 기존 이론 간 브릿지 연구 아이디어 생성
- 연구 혁신 기회 식별

#### 파일 위치

- `frontend/components/graph/GapsViewMode.tsx` - Gaps View 컴포넌트
- `frontend/components/graph/GapPanel.tsx` - Gap 목록 및 선택
- `frontend/components/graph/GapQueryPanel.tsx` - AI 브릿지 제안
- `frontend/components/graph/BridgeHypothesisCard.tsx` - 브릿지 카드 표시

---

### 5.4. View Mode 전환 및 제어

#### 상단 우측 제어 패널

```
┌──────────────────────────────────────┐
│  3D (indicator) │ ⚡ │ ☀️ │ ↻ │ ... │
├──────────────────────────────────────┤
│                View Mode Selector    │
│  ┌─────────┬──────────┬────────┐    │
│  │ 3D      │ Topics   │ Gaps   │    │
│  └─────────┴──────────┴────────┘    │
└──────────────────────────────────────┘
```

#### 뷰 모드 전환 코드

```typescript
// KnowledgeGraph3D.tsx
const [viewMode, setViewMode] = useState<ViewMode>('3d');

// 3D Mode button
<button onClick={() => setViewMode('3d')}>3D</button>

// Topic Mode button
<button onClick={() => setViewMode('topic')}>Topics</button>

// Gaps Mode button
<button onClick={() => setViewMode('gaps')}>Gaps</button>
```

#### 뷰 모드별 패널 표시 규칙

| 패널 | 3D Mode | Topic Mode | Gaps Mode |
|------|---------|-----------|-----------|
| Gap Panel | ✅ | ✅ | ❌ (GapsViewMode 내장) |
| Centrality Panel | ✅ | ✅ | ✅ |
| Cluster Panel | ✅ | ✅ | ✅ |
| Legend | ✅ | ✅ | ✅ |
| Main Topics | ✅ | ✅ | ❌ |
| Insight HUD | ✅ | ✅ | ❌ |
| View Badge (좌측 상단) | ✅ | ✅ | ❌ |

#### 상태 관리

```typescript
// useGraphStore.ts
interface GraphStore {
  viewMode: 'three' | 'topic' | 'gaps';
  setViewMode: (mode: ViewMode) => void;

  // Gap-specific
  selectedGap: StructuralGap | null;
  setSelectedGap: (gap: StructuralGap | null) => void;
  gaps: StructuralGap[];

  // Highlight-specific
  highlightedNodes: string[];
  highlightedEdges: string[];
  setHighlightedNodes: (nodeIds: string[]) => void;
  setHighlightedEdges: (edgeIds: string[]) => void;
  clearHighlights: () => void;
}
```

---

### 5.5. View Mode 비교표

| 기준 | 3D Mode | Topic Mode | Gaps Mode |
|------|---------|-----------|-----------|
| **용도** | 전체 그래프 탐색 | 주제 관계 이해 | 갭 발견 및 분석 |
| **렌더링** | Three.js 3D | D3.js SVG 2D | Three.js 3D + Gaps |
| **표시 단위** | 노드/엣지 | 클러스터 | 갭/브릿지 |
| **인터랙션** | 자유로운 회전/줌 | 클러스터 클릭 | 갭 선택 |
| **노드 수** | 최대 5000+ | 클러스터별 요약 | 필터됨 (Gap 기반) |
| **데이터 밀도** | 매우 높음 | 낮음 | 중간 |
| **로딩 속도** | 느림 (큰 그래프) | 빠름 | 중간 |
| **프레젠테이션용** | 좋음 | 최고 | 중간 |
| **탐색적 분석** | 최고 | 중간 | 최고 |
| **학습곡선** | 중간 | 낮음 | 높음 |

---

### 5.6. 뷰 모드 선택 가이드

#### 시나리오별 추천

**📊 3D Mode를 선택하세요:**
- 전체 그래프 구조를 한눈에 파악하고 싶을 때
- 노드 간 연결 강도와 공간 관계를 탐색할 때
- 특정 노드의 상세 정보를 확인하고 싶을 때
- 커스터마이징 옵션 (Bloom, Particles 등)을 사용할 때

**📈 Topic Mode를 선택하세요:**
- 주요 연구 주제의 비중을 파악하고 싶을 때
- 주제 간 관계를 간단하게 이해하고 싶을 때
- 프레젠테이션이나 보고서용 다이어그램이 필요할 때
- 큰 그래프에서 빠른 성능이 필요할 때

**🔍 Gaps Mode를 선택하세요:**
- 구조적 빈틈(미충족 연결)을 찾고 싶을 때
- 새로운 연구 방향을 발견하고 싶을 때
- AI가 제안하는 브릿지 개념을 분석하고 싶을 때
- 혁신적인 연구 아이디어를 생성하고 싶을 때

---

## 6. Advanced Features

### 6.1. Bloom/Glow Effect

**Bloom Effect**는 Three.js Emissive Materials를 사용하여 노드에 네온 효과를 적용합니다. 3D Mode와 Gaps Mode에서 사용 가능합니다.

#### 설정

| Parameter | Range | Default | 용도 |
|-----------|-------|---------|------|
| **enabled** | Boolean | false | 글로우 효과 활성화 |
| **intensity** | 0.0 - 1.0 | 0.5 | 글로우 강도 제어 |
| **glowSize** | 1.0 - 2.0 | 1.3 | 외곽 글로우 크기 |

#### 토글 방법

Top-right control bar에서:
- `☀️` (Sun icon) - Bloom ON
- `☀️ Dim` (SunDim icon) - Bloom OFF

### 6.2. Particle System

**Particle System**은 배경에 움직이는 입자를 표시하여 시각적 몰입감을 높입니다. 3D Mode에서 선택사항입니다.

#### 설정

| Parameter | Range | Default |
|-----------|-------|---------|
| **enabled** | Boolean | false |
| **speed** | 0.0 - 10.0 | 1.0 |

#### 토글 방법

Top-right control bar에서:
- `⚡` (Zap icon) - Particles ON
- `⚡ Off` (ZapOff icon) - Particles OFF

### 6.3. Camera Controls

#### 3D & Gaps Mode

```
Mouse Controls:
├─ Drag to rotate
├─ Scroll wheel to zoom
├─ Right-click + drag to pan
└─ Double-click to reset focus

Keyboard (Future):
├─ Spacebar: Auto-rotate
└─ R: Reset camera
```

#### Reset Camera Button

Top-right control bar의 `↻` (RotateCcw icon)을 클릭하여 카메라를 초기 상태로 리셋합니다.

---

## 7. Future Enhancements

### Potential Improvements

- **UnrealBloomPass**: Post-processing bloom 효과 (더 강한 네온 효과)
- **Adaptive LOD with Bloom**: 줌 레벨에 따른 bloom 강도 자동 조절
- **Custom Shaders**: GLSL 기반 커스텀 glow 효과
- **Temporal Slider**: 시간 경과에 따른 그래프 진화 표시
- **Collaborative Annotations**: 여러 사용자의 주석 및 태그 지정
- **Export to Various Formats**: SVG, PNG, WebGL, Gltf 등으로 내보내기

---

## 8. Files Reference

### Frontend - Core Components

| 파일 | 역할 | 설명 |
|------|------|------|
| `frontend/components/graph/KnowledgeGraph3D.tsx` | 메인 통합 컴포넌트 | 3가지 뷰 모드 관리 및 제어 |
| `frontend/components/graph/Graph3D.tsx` | 3D 렌더링 | Three.js + Force-directed layout |
| `frontend/components/graph/TopicViewMode.tsx` | Topic 뷰 | D3.js 2D 클러스터 시각화 |
| `frontend/components/graph/GapsViewMode.tsx` | Gaps 뷰 | Gap 탐색 및 분석 |

### Frontend - UI Panels & Utilities

| 파일 | 역할 |
|------|------|
| `frontend/components/graph/Graph3D.tsx` | 3D 그래프 렌더링 |
| `frontend/components/graph/InsightHUD.tsx` | 그래프 메트릭 표시 (HUD) |
| `frontend/components/graph/MainTopicsPanel.tsx` | 클러스터 비중 표시 |
| `frontend/components/graph/GapPanel.tsx` | Gap 목록 및 선택 |
| `frontend/components/graph/GapQueryPanel.tsx` | AI 브릿지 제안 |
| `frontend/components/graph/BridgeHypothesisCard.tsx` | 브릿지 가설 카드 |
| `frontend/components/graph/CentralityPanel.tsx` | Centrality 기반 노드 필터 |
| `frontend/components/graph/ClusterPanel.tsx` | 클러스터 관리 및 포커스 |
| `frontend/components/graph/GraphLegend.tsx` | 범례 및 노드 타입 정보 |
| `frontend/components/graph/NodeDetails.tsx` | 노드 상세 정보 패널 |
| `frontend/components/graph/StatusBar.tsx` | 상태 표시 바 |
| `frontend/components/graph/EdgeContextModal.tsx` | Relationship evidence modal |

### Frontend - Hooks & State Management

| 파일 | 역할 |
|------|------|
| `frontend/hooks/useGraphStore.ts` | 그래프 데이터 & Gap 상태 관리 |
| `frontend/hooks/useGraph3DStore.ts` | 3D 시각화 설정 (Bloom, Particles, LOD) |

### Backend - API & Data Processing

| 파일 | 역할 |
|------|------|
| `backend/graph/gap_detector.py` | 구조적 Gap 감지 및 PotentialEdge 계산 |
| `backend/graph/centrality_analyzer.py` | 노드 중심성 메트릭 계산 |
| `backend/routers/graph.py` | Graph API endpoints |
| `backend/routers/gaps.py` | Gap analysis endpoints |

### Database - Schema

| 마이그레이션 | 내용 |
|----------|------|
| `database/migrations/003_graph_tables.sql` | Entities, Relationships, Clusters |
| `database/migrations/004_concept_centric.sql` | Concept-centric model |
| `database/migrations/009_potential_edges.sql` | Ghost edges for gaps |
| `database/migrations/010_structural_gaps.sql` | Structural gap table |

### Type Definitions

```typescript
// types/index.ts
├── GraphEntity
│  ├─ id: string
│  ├─ name: string
│  ├─ entity_type: EntityType
│  └─ properties: Record<string, any>
│
├── GraphEdge
│  ├─ id: string
│  ├─ source: string
│  ├─ target: string
│  └─ relationship_type: string
│
├── ConceptCluster
│  ├─ cluster_id: number
│  ├─ label: string
│  ├─ size: number
│  ├─ concepts: string[]
│  └─ concept_names: string[]
│
├── StructuralGap
│  ├─ id: string
│  ├─ cluster_a_id: number
│  ├─ cluster_b_id: number
│  ├─ gap_strength: number
│  ├─ bridge_candidates: string[]
│  └─ potential_edges: PotentialEdge[]
│
├── PotentialEdge
│  ├─ source: string
│  ├─ target: string
│  ├─ similarity: number
│  └─ bridge_type: string
│
├── ViewMode
│  └─ '3d' | 'topic' | 'gaps'
│
└── GapsViewConfig
   ├─ selectedGapId: string | null
   ├─ showAllGaps: boolean
   ├─ highlightBridges: boolean
   └─ dimInactiveNodes: boolean
```

---

## 9. Quick Start Guide

### 첫 방문자를 위한 단계별 가이드

#### 1단계: 3D Mode 탐색 (2-3분)
```
1. 프로젝트 열기
2. 기본적으로 3D Mode가 활성화됨
3. 마우스로 드래그하여 그래프 회전
4. 마우스 휠로 줌인/줌아웃
5. 노드 클릭하여 상세 정보 보기
```

#### 2단계: Topic Mode로 전환 (1-2분)
```
1. 상단 우측 "Topics" 버튼 클릭
2. 클러스터 블록의 크기로 주제 비중 파악
3. 클러스터 클릭하면 3D에서 포커스됨
4. 호버하면 해당 노드들 강조
```

#### 3단계: Gaps Mode로 Gap 발견 (3-5분)
```
1. 상단 우측 "Gaps" 버튼 클릭
2. 왼쪽 패널에서 Gap 목록 확인
3. Gap 선택하면:
   - 관련 노드 강조 (A 클러스터, B 클러스터, 브릿지)
   - 잠재적 연결(점선) 표시
   - 카메라 자동 포커스
4. "Generate Bridge" 클릭하여 AI 제안 보기
```

#### 4단계: 패널 활용 (선택사항)
```
Advanced Panels:
├─ Insight HUD (📊): 그래프 품질 메트릭
├─ Main Topics (🥧): 클러스터 비중 차트
├─ Gap Panel (✨): 모든 Gap 목록
├─ Centrality Panel (✂️): 중요 노드 필터
├─ Cluster Panel (Ξ): 클러스터 별 정보
└─ Legend (ℹ️): 노드 타입별 색상 범례
```

---

## 10. 뷰 모드 워크플로우

### 연구 탐색 프로세스

```
START: 프로젝트 로드
   ↓
[3D Mode] - 전체 구조 파악
   │
   ├─ 마우스로 자유롭게 탐색
   ├─ 노드 클릭으로 상세 정보 확인
   ├─ Gap Panel에서 주요 갭 식별
   └─ Centrality Panel로 핵심 개념 필터링
   ↓
[Topic Mode] - 주제별 구조 분석
   │
   ├─ 주요 연구 주제(클러스터) 확인
   ├─ 클러스터 간 관계 파악
   ├─ 주제 균형도 평가
   └─ 프레젠테이션용 다이어그램 스크린샷
   ↓
[Gaps Mode] - 혁신적 아이디어 도출
   │
   ├─ 미충족 연결(Gap) 탐색
   ├─ AI가 제안하는 브릿지 개념 검토
   ├─ 새로운 연구 질문 수립
   └─ 연구 방향성 결정
   ↓
END: 연구 계획 수립 또는 논문 작성
```

### 일반적인 사용 사례

#### Case 1: 계획 단계 (Systematic Review 시작)
```
1. 3D Mode에서 전체 문헌 구조 파악
2. Topic Mode에서 주요 주제 비중 확인
3. Gaps Mode에서 미충족 영역 식별
4. 결론: 연구 범위와 질문 최종 결정
```

#### Case 2: 분석 단계 (논문 작성 중)
```
1. Gap Panel에서 관심 있는 Gap 선택
2. 해당 Gap의 Bridge Hypothesis 생성
3. 3D에서 관련 논문과 개념 확인
4. Topic에서 학파별 구분 검토
5. 결론: 새로운 이론적 기여 구성
```

#### Case 3: 발표 단계 (컨퍼런스/보고)
```
1. Topic Mode에서 깔끔한 클러스터 다이어그램 캡처
2. 3D Mode에서 인상적인 전체 그래프 스크린샷
3. Gaps Mode에서 미래 연구 방향 시각화
4. 결론: 강력한 시각적 자료로 발표
```

---

## 11. 트러블슈팅

### 일반적인 문제 해결

| 문제 | 원인 | 해결법 |
|------|------|--------|
| 3D 그래프가 느림 | 노드가 너무 많음 | Centrality Panel에서 필터링하거나 Topic Mode 사용 |
| Ghost Edge가 안 보임 | Gap이 선택되지 않음 | Gaps Mode 진입 후 Gap 선택 |
| 노드가 중복 보임 | LOD (Level of Detail)로 필터됨 | 카메라를 더 가까이 줌인하거나 LOD 비활성화 |
| 카메라가 이상함 | 마우스 컨트롤 오류 | "Reset Camera" 버튼 (↻) 클릭 |
| 패널이 겹침 | UI 레이아웃 충돌 | 불필요한 패널 토글 OFF |

### 성능 최적화 팁

```
큰 그래프 (2000+ 노드)의 경우:

1. 3D Mode에서 성능 향상
   ├─ Particles 끄기 (⚡ Off)
   ├─ Bloom 끄기 (☀️ Dim)
   └─ Centrality Panel로 노드 필터링

2. Topic Mode 사용
   └─ 매우 빠른 렌더링
   └─ 고수준 분석에 최적

3. Gaps Mode 최적화
   └─ 특정 Gap만 선택하여 분석
   └─ 전체 Gap 동시 표시 피하기
```

---

## 12. 개발자 가이드

### View Mode 추가하기

새로운 뷰 모드를 추가하려면:

```typescript
// 1. ViewMode 타입 확장
type ViewMode = '3d' | 'topic' | 'gaps' | 'yourNewMode';

// 2. 새 컴포넌트 생성
export function YourNewViewMode({ nodes, edges, ...props }) {
  return (
    <YourVisualization>
      {/* Your implementation */}
    </YourVisualization>
  );
}

// 3. KnowledgeGraph3D에서 조건부 렌더링 추가
{viewMode === 'yourNewMode' && (
  <YourNewViewMode {...displayData} />
)}

// 4. 뷰 모드 버튼 추가
<button onClick={() => setViewMode('yourNewMode')}>
  <YourIcon className="w-4 h-4" />
  <span>Your Mode</span>
</button>
```

### Custom Interaction Handler 추가

```typescript
// GapsViewMode에서 커스텀 이벤트 처리
const handleCustomGapAnalysis = useCallback((gap: StructuralGap) => {
  // Custom analysis logic
  console.log('Analyzing gap:', gap.id);
}, []);

// Event binding
<button onClick={() => handleCustomGapAnalysis(selectedGap)}>
  Custom Analysis
</button>
```

---

## 13. 용어 정리

| 용어 | 설명 |
|------|------|
| **Ghost Edge** | 현재 연결되지 않지만 의미론적으로 유사한 노드 쌍을 연결하는 점선 |
| **Structural Gap** | 두 클러스터 사이의 미충족 연결(의미론적 거리가 큼) |
| **Bridge Candidate** | AI가 구조적 갭을 연결할 수 있는 중간 개념으로 제안하는 노드 |
| **Potential Edge** | 계산된 유사도를 기반으로 존재해야 할 것 같은 가상의 엣지 |
| **Cluster** | 유사한 개념들의 그룹 (커뮤니티 감지 알고리즘으로 식별) |
| **Centrality Metrics** | 노드의 중요성을 나타내는 메트릭 (Degree, Betweenness, PageRank 등) |
| **LOD (Level of Detail)** | 줌 레벨에 따라 표시할 노드 수를 조정하는 기법 |
| **Entity Type** | 노드의 분류 (Concept, Method, Finding, Paper, Author 등) |

---

## 14. 성능 참고사항

### 권장 환경

| 지표 | 최소 | 추천 |
|------|------|------|
| 노드 수 (3D) | - | 5000 이하 |
| 노드 수 (Topic) | - | 제한 없음 |
| 노드 수 (Gaps) | - | 1000 이하 |
| 엣지 수 | - | 20,000 이하 |
| 브라우저 | Chrome 80+ | Chrome 120+ |
| GPU | Integrated | Dedicated |
| 메모리 | 4GB | 8GB+ |

### 렌더링 프레임레이트

```
3D Mode:
├─ 1000 노드: 60fps
├─ 5000 노드: 30fps (Bloom/Particles OFF)
└─ 10000+ 노드: 10-20fps (Centrality 필터링 권장)

Topic Mode:
├─ 모든 크기: 60fps (D3.js 최적화)
└─ 클러스터 수 제한 없음

Gaps Mode:
├─ 500 노드: 60fps
└─ 2000+ 노드: 30fps
```

---

## Related Documentation

- [Gap Detection](../user-guide/gap-detection.md)
- [Graph Visualization Architecture](../architecture/graph-visualization.md)
- [Release Notes v0.2.0](../../RELEASE_NOTES_v0.2.0.md)
