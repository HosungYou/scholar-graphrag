# Snapshot Review Checklist

## 목적

스냅샷 테스트를 단순 문자열 비교가 아니라, GraphRAG 신뢰성/표현 정확성 회귀 게이트로 사용한다.

## 적용 범위

- `frontend/__tests__/components/graph/GapPanel.snapshot.test.tsx`
- `frontend/__tests__/components/import/ImportProgress.snapshot.test.tsx`
- `frontend/__tests__/components/graph/Graph3D.snapshot.test.tsx`
- `frontend/__tests__/components/graph/KnowledgeGraph3D.snapshot.test.tsx`
- `frontend/__tests__/components/graph/EdgeContextModal.snapshot.test.tsx` (future)
- `frontend/__tests__/components/chat/ChatInterface.snapshot.test.tsx` (future)
- `frontend/e2e/visual-regression.spec.ts`
- `frontend/e2e/visual-regression.spec.ts-snapshots/*`

## 승인 체크리스트

1. 변경된 스냅샷이 실제 코드 변경 의도와 1:1로 대응되는가
2. 신뢰성 신호가 유지되는가
   - `reliability_summary` 기반 카드/수치
   - low-trust 경고/표현(색상/레이블) 존재
3. 사용자 핵심 흐름이 보존되는가
   - Gap 탐색
   - Import 완료/중단/재개 상태
   - 3D/Topic/Gaps/Temporal 진입 UI
4. 접근성 셀렉터(역할/이름)가 변하지 않았는가
   - 테스트가 `getByRole` 기반으로 계속 찾을 수 있는가
5. 의존성 목(mock) 변경이 실제 동작을 가리지 않는가
   - API/스토어 mock이 계약 필드를 유지하는가
6. 스냅샷 변경량이 과도할 때, 원인 단위를 분리했는가
   - UI 구조 변경
   - 텍스트/카피 변경
   - 데이터 매핑 변경
7. PR 라벨과 템플릿 체크리스트가 triage 판정과 일치하는가
   - `snapshot:accept | snapshot:fix | snapshot:split`
   - `- [x] Snapshot triage reviewed`
8. Provenance 배지(relationship_evidence, source_chunk_ids, text_search, ai_explanation)가 올바른 한국어 레이블로 표시되는가
9. 검색 전략 배지(vector, graph_traversal, hybrid)가 아이콘과 함께 올바르게 표시되는가
10. SAME_AS 엣지가 대시 패턴으로 렌더링되며, 카메라 거리 > 800일 때 숨겨지는가
11. EdgeContextModal의 점진적 공개(첫 번째 청크만 표시 + 확장 버튼)가 동작하는가
12. ImportProgress의 ER 세부 정보 섹션이 기본 접힌 상태인가

## 리뷰 원칙

- 의도 없는 대량 diff는 승인하지 않는다.
- "스냅샷 업데이트만"으로 PR을 종료하지 않는다.
- 신뢰성 지표 관련 diff는 최소 1개 기능 테스트(assertion)와 함께 검토한다.
