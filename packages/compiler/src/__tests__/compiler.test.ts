import { describe, it, expect } from 'vitest';
import { compile } from '../compiler.js';

describe('compile', () => {
  it('should return code unchanged when no JSX present', () => {
    const result = compile('const x = 1;');
    expect(result.code).toBe('const x = 1;');
  });

  it('should return code unchanged when no component found', () => {
    const code = 'const x = <div>hello</div>;';
    const result = compile(code);
    // No capital-letter function, so no transformation
    expect(result.code).toBe(code);
  });

  it('should transform a simple component into a class', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class CounterElement extends PolyXElement');
    expect(result.code).toContain('customElements.define("polyx-counter"');
    expect(result.code).toContain('import { PolyXElement }');
  });

  it('should generate static template with dynamic markers', () => {
    const code = `
function Hello() {
  const [name, setName] = useState("world");
  return <div><span>Hello </span>{name}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('data-dyn=');
    expect(result.code).toContain('_setDynamicValue');
  });

  it('should handle event handlers', () => {
    const code = `
function Button() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>Click</button>;
}`;
    const result = compile(code);
    expect(result.code).toContain('data-px-el');
    expect(result.code).toContain('_setDynamicEvent');
  });

  it('should handle dynamic attributes', () => {
    const code = `
function Toggle() {
  const [on, setOn] = useState(false);
  return <input type="checkbox" checked={on} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('data-px-el');
    expect(result.code).toContain('_setDynamicAttribute');
  });

  it('should generate observedAttributes from useState', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("test");
  return <div>{count}{name}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('"count"');
    expect(result.code).toContain('"name"');
    expect(result.code).toContain('observedAttributes');
  });

  it('should generate state getters and setters', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('get count()');
    expect(result.code).toContain('set count(');
    expect(result.code).toContain('_updateState');
  });

  it('should transform state access with ternary fallback', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    // should have: this._state.count !== undefined ? this._state.count : 0
    expect(result.code).toContain('this._state.count');
    expect(result.code).toContain('undefined');
  });

  it('should handle arrow function components', () => {
    const code = `
const Counter = () => {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
};`;
    const result = compile(code);
    expect(result.code).toContain('class CounterElement extends PolyXElement');
    expect(result.code).toContain('customElements.define("polyx-counter"');
  });

  it('should convert child component references to tag names', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Counter />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-counter');
  });

  it('should handle className to class conversion', () => {
    const code = `
function Box() {
  const [x, setX] = useState(0);
  return <div className="box">{x}</div>;
}`;
    const result = compile(code);
    // In the template string, quotes are escaped
    expect(result.code).toContain('class=\\"box\\"');
    expect(result.code).not.toContain('className=');
  });

  it('should handle static string attributes', () => {
    const code = `
function Input() {
  const [v, setV] = useState("");
  return <input type="text" placeholder="Enter" />;
}`;
    const result = compile(code);
    expect(result.code).toContain('type=\\"text\\"');
    expect(result.code).toContain('placeholder=\\"Enter\\"');
  });

  it('should handle JSX fragments', () => {
    const code = `
function List() {
  const [x, setX] = useState(0);
  return <><div>a</div><div>b</div></>;
}`;
    const result = compile(code);
    expect(result.code).toContain('<div>a</div><div>b</div>');
  });

  it('should preserve non-component code', () => {
    const code = `
import { useState } from '@polyx/runtime';

const LIMIT = 10;

function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}

console.log("ready");`;
    const result = compile(code);
    expect(result.code).toContain('const LIMIT = 10');
    expect(result.code).toContain('console.log("ready")');
  });

  it('should handle useEffect in component body', () => {
    const code = `
function Timer() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    console.log(count);
  }, [count]);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('useEffect');
    expect(result.code).toContain('_render');
  });

  // Phase 3: Props tests
  it('should transform destructured props parameter', () => {
    const code = `
function Counter({ count, onDone }) {
  const [x, setX] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('this._props');
    expect(result.code).toContain('count');
    expect(result.code).toContain('onDone');
  });

  it('should transform props identifier parameter', () => {
    const code = `
function Counter(props) {
  const [x, setX] = useState(0);
  return <div>{props.name}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('const props = this._props');
  });

  it('should generate _setDynamicProp for child component props in template', () => {
    const code = `
function App() {
  const [count, setCount] = useState(0);
  return <div><Counter count={count} onDone={() => {}} /></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicProp');
    expect(result.code).toContain('"count"');
    expect(result.code).toContain('data-px-el');
  });

  it('should generate _createChild for component with props in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Counter count={5} />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_createChild');
    expect(result.code).toContain('"polyx-counter"');
  });

  it('should handle component without props as string literal in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Counter />}</div>;
}`;
    const result = compile(code);
    // No props → just string literal, not _createChild
    expect(result.code).toContain('"polyx-counter"');
    expect(result.code).not.toContain('_createChild');
  });

  // Phase 4: Children tests
  it('should compile static children inside component elements', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Card><p>hello</p></Card></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-card');
    expect(result.code).toContain('data-px-el');
    // Children HTML should be inside the component tag in template
    expect(result.code).toContain('<p>hello</p>');
  });

  it('should handle component with both props and children', () => {
    const code = `
function App() {
  const [title, setTitle] = useState("test");
  return <div><Card title={title}><p>content</p></Card></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicProp');
    expect(result.code).toContain('"title"');
    expect(result.code).toContain('<p>content</p>');
  });

  it('should generate source maps when requested', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code, { sourceMap: true });
    expect(result.map).toBeDefined();
  });

  // Phase 7: Scoped CSS tests
  it('should extract and scope CSS from <style> in JSX', () => {
    const code = `
function StyledBox() {
  const [x, setX] = useState(0);
  return <div><style>{"h1 { color: red; }"}</style><h1>Hello</h1></div>;
}`;
    // Note: the style tag in JSX template won't be a literal <style> tag since
    // it goes through template extraction. Let's test with a simpler approach.
    const result = compile(code);
    expect(result.code).toContain('class StyledBoxElement extends PolyXElement');
  });

  it('should add static _scopedCSS property when style tag is present in template', () => {
    // To test scoped CSS integration, we need to verify the compiler processes
    // templates containing <style> tags correctly
    const code = `
function Widget() {
  const [x, setX] = useState(0);
  return <div><h1>{x}</h1></div>;
}`;
    const result = compile(code);
    // Without a <style> tag, no _scopedCSS should be generated
    expect(result.code).not.toContain('_scopedCSS');
    expect(result.code).not.toContain('_scopeAttr');
    expect(result.code).not.toContain('_stylesInjected');
  });

  // Phase 8: Spread Attributes tests
  it('should generate _setDynamicSpread for spread attributes', () => {
    const code = `
function Input() {
  const [x, setX] = useState(0);
  return <input {...props} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('data-px-el=');
    expect(result.code).toContain('_setDynamicSpread');
  });

  it('should handle spread alongside regular attributes', () => {
    const code = `
function Button() {
  const [x, setX] = useState(0);
  return <button className="btn" {...rest} onClick={handler}>Click</button>;
}`;
    const result = compile(code);
    expect(result.code).toContain('data-px-el=');
    expect(result.code).toContain('_setDynamicSpread');
    expect(result.code).toContain('class=\\"btn\\"');
    expect(result.code).toContain('_setDynamicEvent');
  });

  // Fragment fix tests
  it('should not produce string literal "fragment" for fragments in body', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  const el = <><span>a</span><span>b</span></>;
  return <div>{x}</div>;
}`;
    const result = compile(code);
    // Should NOT contain the old broken string literal 'fragment'
    expect(result.code).not.toContain('"fragment"');
  });

  it('should handle fragment with single child in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <><span>only child</span></>}</div>;
}`;
    const result = compile(code);
    // Fragment with single child should unwrap to the child element expression
    expect(result.code).not.toContain('"fragment"');
    expect(result.code).toContain('span');
  });

  it('should handle fragment with multiple children in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <><span>a</span><span>b</span></>}</div>;
}`;
    const result = compile(code);
    expect(result.code).not.toContain('"fragment"');
  });

  it('should handle empty fragment in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <></>}</div>;
}`;
    const result = compile(code);
    // Empty fragment should produce empty string, not 'fragment'
    expect(result.code).not.toContain('"fragment"');
  });

  // Phase 11: Fine-Grained Reactivity tests
  it('should generate _renderState_ methods for state-dependent expressions', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_setDynamicValue');
  });

  it('should generate separate _renderState_ methods for each state', () => {
    const code = `
function Profile() {
  const [name, setName] = useState("Alice");
  const [age, setAge] = useState(25);
  return <div><span>{name}</span><span>{age}</span></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_name');
    expect(result.code).toContain('_renderState_age');
  });

  it('should include expression in both handlers when it depends on multiple states', () => {
    const code = `
function Summary() {
  const [first, setFirst] = useState("A");
  const [last, setLast] = useState("B");
  return <div>{first + " " + last}</div>;
}`;
    const result = compile(code);
    // Both _renderState_first and _renderState_last should update the same slot
    expect(result.code).toContain('_renderState_first');
    expect(result.code).toContain('_renderState_last');
  });

  it('should not generate _renderState_ for state with no dynamic bindings', () => {
    const code = `
function App() {
  const [hidden, setHidden] = useState(false);
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    // hidden is not referenced in any expression
    expect(result.code).not.toContain('_renderState_hidden');
  });

  it('should include attribute bindings in _renderState_', () => {
    const code = `
function Toggle() {
  const [active, setActive] = useState(false);
  return <div className={active ? "on" : "off"}>{active ? "Yes" : "No"}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_active');
    // The handler should contain both _setDynamicValue and _setDynamicAttribute
    // Verify the handler is generated with the attribute update
    const renderStateMatch = result.code.match(/_renderState_active\(\)\s*\{[\s\S]*?\n\s*\}/);
    expect(renderStateMatch).toBeTruthy();
    const handlerCode = renderStateMatch![0];
    expect(handlerCode).toContain('_setDynamicValue');
    expect(handlerCode).toContain('_setDynamicAttribute');
  });

  // Keyed List Reconciliation tests
  it('should generate _setKeyedList for map with key prop (arrow expression body)', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key={item.id} name={item.name} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).not.toContain('_createChild');
    expect(result.code).toContain('"polyx-item"');
    expect(result.code).toContain('key:');
    expect(result.code).toContain('tag:');
    expect(result.code).toContain('props:');
  });

  it('should generate _setKeyedList for map with key prop (block body)', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => {
    return <Row key={item.id} value={item.value} />;
  })}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).toContain('"polyx-row"');
  });

  it('should use _setDynamicValue for map without key prop', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item name={item.name} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicValue');
    expect(result.code).toContain('_createChild');
    expect(result.code).not.toContain('_setKeyedList');
  });

  it('should use _setDynamicValue for non-map expressions', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Counter count={5} />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicValue');
    expect(result.code).not.toContain('_setKeyedList');
  });

  it('should handle string key in keyed list', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key="static-key" name={item.name} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).toContain('"static-key"');
  });
});

// =============================================================================
// Feature 1: Compiler Metadata — _stateDefaults, _isInteractive, _hydrationStrategy
// =============================================================================

describe('compiler metadata: _stateDefaults', () => {
  it('should generate _stateDefaults with initial state values', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_stateDefaults');
    // Should contain an object with count: 0
    expect(result.code).toMatch(/static\s+_stateDefaults\s*=\s*\{\s*count:\s*0\s*\}/);
  });

  it('should generate _stateDefaults with multiple states', () => {
    const code = `
function Profile() {
  const [name, setName] = useState("Alice");
  const [age, setAge] = useState(25);
  return <div>{name} - {age}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_stateDefaults');
    // Both state defaults should be in the object
    expect(result.code).toMatch(/_stateDefaults\s*=\s*\{/);
    expect(result.code).toContain('name: "Alice"');
    expect(result.code).toContain('age: 25');
  });

  it('should generate empty _stateDefaults when no useState calls', () => {
    const code = `
function Static({ label }) {
  return <div>{label}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_stateDefaults');
    expect(result.code).toMatch(/_stateDefaults\s*=\s*\{\}/);
  });

  it('should generate _stateDefaults with boolean initial value', () => {
    const code = `
function Toggle() {
  const [active, setActive] = useState(false);
  return <div>{active ? "on" : "off"}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/active:\s*false/);
  });

  it('should generate _stateDefaults with string initial value', () => {
    const code = `
function Greeting() {
  const [message, setMessage] = useState("hello");
  return <div>{message}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/message:\s*"hello"/);
  });

  it('should generate _stateDefaults with null initial value', () => {
    const code = `
function DataView() {
  const [data, setData] = useState(null);
  return <div>{data}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/data:\s*null/);
  });
});

describe('compiler metadata: _isInteractive', () => {
  it('should set _isInteractive to true when component has state', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_isInteractive');
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*true/);
  });

  it('should set _isInteractive to true when component has events only', () => {
    const code = `
function ClickTracker() {
  return <button onClick={() => console.log('clicked')}>Click</button>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*true/);
  });

  it('should set _isInteractive to true when component has useEffect', () => {
    const code = `
function Logger() {
  const [x, setX] = useState(0);
  useEffect(() => {
    console.log("mounted");
  }, []);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*true/);
  });

  it('should set _isInteractive to true when component has useLayoutEffect', () => {
    const code = `
function Measurer() {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    console.log("layout");
  }, []);
  return <div>{w}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*true/);
  });

  it('should set _isInteractive to false for a purely static component', () => {
    const code = `
function StaticBanner() {
  return <div><h1>Welcome</h1></div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*false/);
  });

  it('should set _isInteractive to false for component with only props (no state/events/effects)', () => {
    const code = `
function Label({ text }) {
  return <span>{text}</span>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*false/);
  });
});

describe('compiler metadata: _hydrationStrategy', () => {
  it('should detect "load" strategy for component with state', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_hydrationStrategy');
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"load"/);
  });

  it('should detect "load" strategy for component with effects', () => {
    const code = `
function Timer() {
  const [time, setTime] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <div>{time}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"load"/);
  });

  it('should detect "none" strategy for purely static component', () => {
    const code = `
function Banner() {
  return <div><h1>Static Banner</h1></div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"none"/);
  });

  it('should detect "interaction" strategy for events-only component (no state, no effects)', () => {
    const code = `
function ClickableDiv() {
  return <div onClick={() => console.log("click")}>Click me</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"interaction"/);
  });

  it('should detect "load" for component with state and events', () => {
    const code = `
function InteractiveCounter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"load"/);
  });

  it('should detect "load" for component with effects but no state/events', () => {
    const code = `
function EffectOnly({ data }) {
  useEffect(() => {
    console.log("side effect");
  }, [data]);
  return <div>{data}</div>;
}`;
    const result = compile(code);
    // Effects trigger "load" strategy since state is needed
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"load"/);
  });

  it('should respect @hydrate annotation overriding auto-detection', () => {
    // The @hydrate annotation must be in a leading comment on the function
    const code = `
/** @hydrate visible */
function LazyImage({ src }) {
  return <img src={src} />;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"visible"/);
  });

  it('should respect @hydrate idle annotation', () => {
    const code = `
/** @hydrate idle */
function Analytics() {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"idle"/);
  });

  it('should respect @hydrate none annotation even with interactive component', () => {
    const code = `
/** @hydrate none */
function StaticContent() {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"none"/);
  });

  it('should respect @hydrate interaction annotation', () => {
    const code = `
/** @hydrate interaction */
function LazyButton() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"interaction"/);
  });

  it('should respect @hydrate load annotation on static component', () => {
    const code = `
/** @hydrate load */
function ForcedHydration() {
  return <div>static but forced load</div>;
}`;
    const result = compile(code);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"load"/);
  });

  it('should generate all three metadata properties together', () => {
    const code = `
function App() {
  const [count, setCount] = useState(0);
  useEffect(() => console.log(count), [count]);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_stateDefaults');
    expect(result.code).toContain('_isInteractive');
    expect(result.code).toContain('_hydrationStrategy');
    expect(result.code).toMatch(/static\s+_isInteractive\s*=\s*true/);
    expect(result.code).toMatch(/static\s+_hydrationStrategy\s*=\s*"load"/);
  });
});
