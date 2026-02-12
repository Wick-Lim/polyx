// PolyX Component Types
export interface PolyXComponent<P = {}> {
  (props: P): PolyXElement;
}

export interface PolyXElement {
  type: string | PolyXComponent;
  props: Record<string, any>;
  children: PolyXNode[];
}

export type PolyXNode = PolyXElement | string | number | null | undefined;

// Hook Types
export type HookState = any;
export type HookReducer<S, A> = (state: S, action: A) => S;

export interface HookEffect {
  callback: () => void | (() => void);
  deps: any[] | undefined;
  cleanup?: () => void;
}

// Component Instance
export interface ComponentInstance {
  hooks: HookState[];
  hookIndex: number;
  effects: HookEffect[];
  layoutEffects: HookEffect[];
  element: HTMLElement;
  render: () => void;
}

// Props Types
export type Props = Record<string, any>;

// Compiler Types
export interface CompilerOptions {
  target?: 'es2020' | 'es2022';
  minify?: boolean;
  sourceMap?: boolean;
}

export interface TransformResult {
  code: string;
  map?: string;
}
