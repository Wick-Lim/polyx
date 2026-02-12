# PolyX

JSX 코드를 브라우저 표준 **Custom Elements**로 컴파일하여 네이티브 HTML 수준의 성능과 가벼움을 제공하는 React 대체 솔루션입니다.

## 주요 특징

- **Native Web Components**: 가상 DOM 없이 브라우저 표준 `HTMLElement`를 확장하여 작동합니다.
- **Template-Based Rendering**: `<template>` 태그와 `cloneNode`를 사용하여 최소한의 오버헤드로 DOM을 생성합니다.
- **React-like DX**: `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `useLayoutEffect` 등 익숙한 Hooks와 JSX 문법을 그대로 사용합니다.
- **No Virtual DOM**: 변경된 부분의 마커(Comment Node)를 직접 찾아 업데이트하므로 메모리 사용량이 적습니다.
- **Vite Integration**: Vite 플러그인을 통해 빌드 타임에 모든 JSX를 고성능 클래스 구조로 변환합니다.

## 프로젝트 구조

npm workspaces 기반 모노레포로 구성되어 있습니다.

```
packages/
├── core/           # 공통 타입 및 상수 정의
├── compiler/       # Babel 기반 JSX → Custom Element 클래스 변환 엔진
├── runtime/        # PolyXElement 기반 클래스, Hooks 시스템, 동적 마커 관리
└── vite-plugin/    # Vite 환경에서의 자동 컴파일 통합

examples/
└── counter/        # 카운터 예제 앱
```

### 의존성 관계

```
core ← compiler ← vite-plugin
core ← runtime
```

## 시작하기

```bash
# 의존성 설치
npm install

# 모든 패키지 빌드
npm run build

# 개발 모드 (watch)
npm run dev

# 예제 실행
cd examples/counter
npm run dev
# → http://localhost:5173
```

## 사용 방법

### 1. Vite 설정

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import polyx from '@polyx/vite-plugin';

export default defineConfig({
  plugins: [polyx()],
});
```

### 2. 컴포넌트 작성 (JSX)

```jsx
import { useState, useEffect } from '@polyx/runtime';

export default function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log('Count changed:', count);
  }, [count]);

  return (
    <div className="counter">
      <h2>PolyX Counter</h2>
      <p>Current count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
      <button onClick={() => setCount(c => c - 1)}>Decrement</button>
    </div>
  );
}
```

### 3. HTML에서 사용

컴포넌트 함수명이 자동으로 Custom Element 태그로 변환됩니다: `Counter` → `<polyx-counter>`

```html
<polyx-counter></polyx-counter>
<script type="module" src="/src/main.js"></script>
```

## 컴파일 과정

빌드 타임에 JSX 컴포넌트가 네이티브 Custom Element 클래스로 변환됩니다.

**입력 (JSX):**
```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**출력 (Custom Element):**
```javascript
class CounterElement extends PolyXElement {
  static template = PolyXElement.createTemplate(`
    <button data-event-click="0"><span data-dyn="0"></span></button>
  `);

  static get observedAttributes() { return ['count']; }

  _render() {
    const count = this._state.count !== undefined ? this._state.count : 0;
    const setCount = (val) => this._updateState('count',
      typeof val === 'function' ? val(this._state.count) : val);

    this._setDynamicValue(0, count);
    this._setDynamicEvent(0, 'click', () => setCount(c => c + 1));
  }
}

customElements.define('polyx-counter', CounterElement);
```

### 동적 바인딩 마커

| 마커 | 용도 | 예시 |
|------|------|------|
| `data-dyn="{index}"` | 동적 텍스트/노드 | `<span data-dyn="0"></span>` |
| `data-attr-{name}="{index}"` | 동적 속성 | `data-attr-class="0"` |
| `data-event-{event}="{index}"` | 이벤트 리스너 | `data-event-click="0"` |

## 지원 Hooks

| Hook | 설명 |
|------|------|
| `useState` | 상태 관리, setter 호출 시 리렌더링 |
| `useEffect` | 렌더링 후 사이드 이펙트 (microtask로 실행) |
| `useLayoutEffect` | 페인트 전 동기 실행 이펙트 |
| `useRef` | 렌더 간 유지되는 mutable 컨테이너 |
| `useMemo` | 의존성 기반 값 메모이제이션 |
| `useCallback` | 의존성 기반 콜백 메모이제이션 |

## 패키지 세부 정보

### @polyx/core
공통 타입(`PolyXComponent`, `ComponentInstance`, `HookEffect`, `CompilerOptions`)과 상수(`POLYX_TAG_PREFIX`, `HOOK_TYPES`, `JSX_PRAGMA`) 정의.

### @polyx/compiler
Babel을 사용하여 JSX/TSX를 파싱하고, 대문자로 시작하는 함수 컴포넌트를 찾아 `PolyXElement`을 확장하는 Custom Element 클래스로 변환합니다.

### @polyx/runtime
`PolyXElement` 기반 클래스(템플릿 캐싱, 마커 기반 업데이트, Custom Element 라이프사이클 관리)와 React 호환 Hooks 시스템을 제공합니다. 외부 의존성 없이 순수 Web Components API를 사용합니다.

### @polyx/vite-plugin
Vite의 `transform` 훅에서 `.jsx`/`.tsx` 파일을 감지하여 PolyX 컴파일러를 자동 실행합니다. `esbuild.jsx = 'preserve'`로 설정하여 PolyX가 JSX 변환을 담당합니다.

## 기술 스택

- **TypeScript** (ES2022, ESM)
- **Babel** v7.23 — AST 파싱 및 코드 변환
- **Vite** v4/v5 — 개발 서버 및 빌드

## 로드맵

- [ ] **Fine-grained Reactivity**: 변경된 상태에 연결된 마커만 선택적으로 업데이트
- [ ] **Scoped CSS**: 컴포넌트별 스타일 격리 (CSS-in-JS 또는 Shadow DOM)
- [ ] **Complex Props**: 객체/함수 등 복잡한 데이터의 Property 전달 최적화
- [ ] **Slot & Children**: `props.children`을 통한 컴포넌트 합성 기능 강화
- [ ] **SSR & Hydration**: 서버 사이드 렌더링 및 클라이언트 하이드레이션 지원

## 라이선스

MIT
