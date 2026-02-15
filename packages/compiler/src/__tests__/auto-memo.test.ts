import { describe, it, expect } from 'vitest';
import { compile } from '../compiler.js';

describe('Auto-Memoization', () => {
  it('should auto-memo inline arrow function with state dep', () => {
    const code = `
function Parent() {
  const [count, setCount] = useState(0);
  return <Child onClick={() => setCount(count + 1)} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('_execMemo');
  });

  it('should auto-memo inline object expression with state dep', () => {
    const code = `
function Parent() {
  const [theme, setTheme] = useState('dark');
  return <Child style={{ color: theme }} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('_execMemo');
  });

  it('should auto-memo inline array expression with state dep', () => {
    const code = `
function Parent() {
  const [a, setA] = useState(1);
  return <Child items={[a, 2, 3]} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('_execMemo');
  });

  it('should auto-memo function call with state dep', () => {
    const code = `
function Parent() {
  const [x, setX] = useState(0);
  return <Child data={compute(x)} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('_execMemo');
  });

  it('should NOT auto-memo primitive expressions', () => {
    const code = `
function Parent() {
  const [count, setCount] = useState(0);
  return <Child value={count + 1} />;
}`;
    const result = compile(code);
    // count + 1 is a BinaryExpression, not a candidate type for auto-memo
    expect(result.code).not.toContain('_execMemo');
  });

  it('should NOT auto-memo static constants (no state dep)', () => {
    const code = `
function Parent() {
  const [count, setCount] = useState(0);
  return <Child onClick={staticFn} style={{ color: 'red' }} />;
}`;
    const result = compile(code);
    // staticFn is an Identifier (not a candidate type), and { color: 'red' } has no state dep
    expect(result.code).not.toContain('_execMemo');
  });

  it('should auto-memo with derived hook deps', () => {
    const code = `
function Parent() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);
  return <Child onClick={() => console.log(doubled)} />;
}`;
    const result = compile(code);
    // The arrow function references `doubled` which is derived from state
    expect(result.code).toContain('_execMemo');
  });

  it('should auto-memo with prop + state deps including both in deps array', () => {
    const code = `
function Parent({ label }) {
  const [count, setCount] = useState(0);
  return <Child onClick={() => console.log(label, count)} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('_execMemo');
    // Both label (prop) and count (state) should appear in the deps array
    // The _execMemo call format: _execMemo(idx, () => expr, [dep1, dep2])
    const execMemoMatch = result.code.match(/_execMemo\(\d+,\s*\(\)\s*=>[\s\S]*?,\s*\[([^\]]*)\]\)/);
    expect(execMemoMatch).toBeTruthy();
    const depsContent = execMemoMatch![1];
    expect(depsContent).toContain('label');
    expect(depsContent).toContain('count');
  });

  it('should NOT auto-memo member call expressions', () => {
    const code = `
function Parent() {
  const [items, setItems] = useState([]);
  return <Child data={items.filter(x => x)} />;
}`;
    const result = compile(code);
    // items.filter(x => x) is a CallExpression with MemberExpression callee,
    // which is excluded by the !t.isMemberExpression(expr.callee) check
    expect(result.code).not.toContain('_execMemo');
  });
});
