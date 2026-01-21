# Frontend CORS Error Handling Guide

> **INFRA-007**: CORS 헤더 누락 문제 해결 가이드

## 문제 배경

Render 배포 환경에서 502/503 에러 발생 시 CORS 헤더가 누락되는 문제가 있습니다.

### CORS 헤더가 정상 추가되는 경우

| 시나리오 | CORS 헤더 | 설명 |
|----------|-----------|------|
| 정상 응답 (200, 201) | ✅ | FastAPI CORSMiddleware 처리 |
| FastAPI 에러 (400, 404, 500) | ✅ | CORSErrorHandlerMiddleware 처리 |
| 인증 실패 (401, 403) | ✅ | FastAPI 내부 처리 |
| Validation 에러 (422) | ✅ | FastAPI 내부 처리 |

### CORS 헤더가 누락되는 경우

| 시나리오 | CORS 헤더 | 원인 |
|----------|-----------|------|
| Render LB 502 | ❌ | 백엔드 프로세스 크래시 |
| Render LB 503 | ❌ | 백엔드 응답 없음/타임아웃 |
| 네트워크 타임아웃 | ❌ | 요청이 백엔드 도달 전 실패 |

## 프론트엔드 권장 처리 방법

### 1. 기본 API 호출 패턴

```typescript
// lib/api.ts
export async function apiCall<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      // HTTP 에러 (CORS 헤더 있음 - 응답 body 읽기 가능)
      const error = await response.json().catch(() => ({}));
      throw new APIError(
        error.detail || `Request failed with status ${response.status}`,
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    // CORS 에러 또는 네트워크 에러
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new NetworkError(
        '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
      );
    }
    throw error;
  }
}
```

### 2. 에러 클래스 정의

```typescript
// lib/errors.ts
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }

  // CORS 에러와 네트워크 에러 구분 불가 - 브라우저 보안 제한
  // 따라서 사용자에게는 일반적인 연결 오류로 표시
}
```

### 3. 컴포넌트에서 사용

```tsx
// components/ImportButton.tsx
import { apiCall, NetworkError, APIError } from '@/lib/api';

function ImportButton() {
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleImport = async () => {
    try {
      setError(null);
      const result = await apiCall('/api/import/zotero', {
        method: 'POST',
        body: JSON.stringify({ collection_id: '...' }),
      });
      // 성공 처리
    } catch (err) {
      if (err instanceof NetworkError) {
        setError('서버 연결 실패. 잠시 후 다시 시도해주세요.');
        // 자동 재시도 옵션 표시
        setIsRetrying(true);
      } else if (err instanceof APIError) {
        setError(err.message);
      } else {
        setError('알 수 없는 오류가 발생했습니다.');
      }
    }
  };

  return (
    <>
      <button onClick={handleImport}>Import</button>
      {error && (
        <div className="error">
          {error}
          {isRetrying && (
            <button onClick={handleImport}>다시 시도</button>
          )}
        </div>
      )}
    </>
  );
}
```

### 4. 자동 재시도 로직 (권장)

```typescript
// lib/api.ts
export async function apiCallWithRetry<T>(
  endpoint: string,
  options?: RequestInit,
  maxRetries: number = 3,
  retryDelay: number = 2000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall<T>(endpoint, options);
    } catch (error) {
      lastError = error as Error;

      // NetworkError만 재시도 (CORS/502/503 포함)
      if (error instanceof NetworkError && attempt < maxRetries - 1) {
        console.warn(`Request failed, retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2; // Exponential backoff
        continue;
      }

      // APIError는 재시도하지 않음 (서버가 명시적으로 거부)
      throw error;
    }
  }

  throw lastError;
}
```

## 사용자 경험 권장사항

### 1. 에러 메시지 (한국어)

| 상황 | 메시지 |
|------|--------|
| 네트워크/CORS 에러 | "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." |
| 502/503 (감지 불가) | (위와 동일 - 구분 불가) |
| 401 Unauthorized | "로그인이 필요합니다." |
| 403 Forbidden | "접근 권한이 없습니다." |
| 404 Not Found | "요청한 리소스를 찾을 수 없습니다." |
| 500 Server Error | "서버 오류가 발생했습니다. 문제가 계속되면 관리자에게 문의하세요." |

### 2. 재시도 버튼

CORS/네트워크 에러 발생 시 "다시 시도" 버튼을 표시하여 사용자가 수동으로 재시도할 수 있게 합니다.

### 3. 상태 표시

장시간 작업(예: Zotero Import) 중 에러 발생 시:
- 진행률 표시 유지
- "연결 재시도 중..." 메시지 표시
- 백그라운드에서 자동 재시도

## 테스트 방법

### 1. CORS 에러 시뮬레이션

```javascript
// 개발자 도구 Console에서
// 잘못된 Origin으로 요청 시도
fetch('https://scholarag-graph-docker.onrender.com/health', {
  mode: 'cors',
  headers: {
    'Origin': 'https://malicious-site.com'
  }
}).catch(e => console.log('CORS blocked:', e));
```

### 2. 네트워크 에러 시뮬레이션

Chrome DevTools → Network → Offline mode 활성화

### 3. 502/503 시뮬레이션

Render Dashboard에서 서비스 일시 중지 후 요청

## 관련 파일

- `backend/middleware/cors_error_handler.py` - CORS 에러 핸들러 미들웨어
- `backend/main.py` - 미들웨어 등록
- `frontend/lib/api.ts` - API 클라이언트 (권장 구현)

## 참고

- [MDN: CORS](https://developer.mozilla.org/ko/docs/Web/HTTP/CORS)
- [Fetch API: TypeError](https://developer.mozilla.org/en-US/docs/Web/API/fetch#exceptions)
- [INFRA-007 Action Item](../project-management/action-items.md)
