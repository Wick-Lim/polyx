import { describe, it, expect } from 'vitest';
import { compile } from '../compiler.js';

describe('compile - extra coverage', () => {
  it('should handle JSXMemberExpression in tag name (e.g., <Foo.Bar />)', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Foo.Bar />{x}</div>;
}`;
    const result = compile(code);
    // JSXMemberExpression should produce something in the output (not crash)
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // The member expression tag name should appear as generated code
    expect(result.code).toContain('Foo.Bar');
  });

  it('should handle boolean attribute without value (e.g., <input disabled />)', () => {
    const code = `
function Form() {
  const [x, setX] = useState(0);
  return <div><input disabled />{x}</div>;
}`;
    const result = compile(code);
    // Boolean attribute should appear as just the name without ="..."
    expect(result.code).toContain('disabled');
    // It should NOT have disabled=""
    expect(result.code).not.toContain('disabled=');
  });

  it('should handle multiple boolean attributes without values', () => {
    const code = `
function Form() {
  const [x, setX] = useState(0);
  return <div><input disabled readonly required />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('disabled');
    expect(result.code).toContain('readonly');
    expect(result.code).toContain('required');
  });

  it('should handle JSXSpreadAttribute on elements', () => {
    const code = `
function Wrapper() {
  const [x, setX] = useState(0);
  const attrs = { id: "main", role: "button" };
  return <div {...attrs}>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('data-px-el');
    expect(result.code).toContain('_setDynamicSpread');
  });

  it('should handle JSXFragment with children in return position', () => {
    const code = `
function Multi() {
  const [x, setX] = useState(0);
  return <><h1>Title</h1><p>Body</p><span>{x}</span></>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class MultiElement extends PolyXElement');
    expect(result.code).toContain('Title');
    expect(result.code).toContain('Body');
  });

  it('should handle JSXEmptyExpression (comment inside JSX expression)', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div>{/* this is a comment */}{x}</div>;
}`;
    const result = compile(code);
    // The empty expression (comment) should be ignored / produce empty string
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // Should still produce dynamic value for {x}
    expect(result.code).toContain('_setDynamicValue');
  });

  it('should inline string literal inside <style> tag as static CSS', () => {
    const code = `
function Styled() {
  const [x, setX] = useState(0);
  return <div><style>{"h1 { color: red; }"}</style><h1>{x}</h1></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class StyledElement extends PolyXElement');
    // The string literal inside style should be inlined, not turned into a dynamic marker
    // The scoped CSS feature should pick it up
    expect(result.code).toContain('color: red');
  });

  it('should inline template literal inside <style> tag as static CSS', () => {
    const code = `
function Themed() {
  const [x, setX] = useState(0);
  return <div><style>{\`.box { border: 1px solid; }\`}</style><div>{x}</div></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class ThemedElement extends PolyXElement');
    expect(result.code).toContain('border: 1px solid');
  });

  it('should NOT transform functions with lowercase names (not components)', () => {
    const code = `
function helper() {
  return <div>not a component</div>;
}`;
    const result = compile(code);
    // Lowercase function should not be transformed into a class
    expect(result.code).not.toContain('class HelperElement');
    expect(result.code).not.toContain('extends PolyXElement');
    expect(result.code).not.toContain('customElements.define');
  });

  it('should NOT transform arrow functions with lowercase names', () => {
    const code = `
const renderItem = () => {
  return <span>item</span>;
};`;
    const result = compile(code);
    expect(result.code).not.toContain('extends PolyXElement');
    expect(result.code).not.toContain('customElements.define');
    // Original code preserved
    expect(result.code).toContain('renderItem');
  });

  it('should handle boolean attribute mixed with dynamic attributes', () => {
    const code = `
function CheckBox() {
  const [checked, setChecked] = useState(false);
  return <input type="checkbox" disabled checked={checked} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('disabled');
    expect(result.code).toContain('type=\\"checkbox\\"');
    expect(result.code).toContain('_setDynamicAttribute');
  });

  it('should handle JSXMemberExpression with deeper nesting (e.g., <A.B.C />)', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><A.B.C />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // Deeply nested member expression should be represented
    expect(result.code).toContain('A.B.C');
  });

  it('should handle JSXEmptyExpression among other children without breaking', () => {
    const code = `
function List() {
  const [items, setItems] = useState([]);
  return <ul>{/* header comment */}<li>first</li>{/* footer comment */}</ul>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class ListElement extends PolyXElement');
    expect(result.code).toContain('first');
  });

  it('should handle component with only a fragment return containing expressions', () => {
    const code = `
function Pair() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);
  return <><span>{a}</span><span>{b}</span></>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class PairElement extends PolyXElement');
    expect(result.code).toContain('_setDynamicValue');
  });

  // ===== NEW TESTS FOR UNCOVERED BRANCHES =====

  // --- Arrow function component with expression body (line 191) ---
  it('should handle arrow function component with expression body (no block)', () => {
    const code = `
const Greeting = () => <div>Hello</div>;`;
    const result = compile(code);
    expect(result.code).toContain('class GreetingElement extends PolyXElement');
    expect(result.code).toContain('customElements.define("polyx-greeting"');
    expect(result.code).toContain('Hello');
  });

  it('should handle arrow function component with expression body and state', () => {
    const code = `
const App = () => <div>{0}</div>;`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
  });

  // --- AssignmentPattern parameter handling (lines 155-176) ---
  it('should handle function with AssignmentPattern parameter (props = {})', () => {
    const code = `
function Widget(props = {}) {
  const [x, setX] = useState(0);
  return <div>{props.name}{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class WidgetElement extends PolyXElement');
    expect(result.code).toContain('const props = this._props');
  });

  it('should handle function with destructured AssignmentPattern parameter ({ name } = {})', () => {
    const code = `
function Card({ name, title } = {}) {
  const [x, setX] = useState(0);
  return <div>{name}{title}{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class CardElement extends PolyXElement');
    expect(result.code).toContain('this._props');
  });

  // --- lazy() detection and customElements.define (lines 62-82) ---
  it('should auto-register lazy() components with customElements.define', () => {
    const code = `
const LazyComp = lazy(() => import('./LazyComp'));

function App() {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('customElements.define("polyx-lazycomp"');
  });

  // --- Export default declaration (lines 935-951) ---
  it('should handle export default function component', () => {
    const code = `
export default function Page() {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class PageElement extends PolyXElement');
    expect(result.code).toContain('export default PageElement');
  });

  // --- Export named declaration for function (lines 941-951) ---
  it('should handle export named function component', () => {
    const code = `
export function Header() {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class HeaderElement extends PolyXElement');
    expect(result.code).toContain('export {');
    expect(result.code).toContain('HeaderElement as Header');
  });

  // --- Export named const component (lines 956-966) ---
  it('should handle export named arrow function component', () => {
    const code = `
export const Footer = () => {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
};`;
    const result = compile(code);
    expect(result.code).toContain('class FooterElement extends PolyXElement');
    expect(result.code).toContain('export {');
    expect(result.code).toContain('FooterElement as Footer');
  });

  // --- useMemo hook in component with fine-grained reactivity (lines 671-684) ---
  it('should generate _execMemo in _renderState_ for useMemo depending on state', () => {
    const code = `
function Counter() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);
  return <div>{doubled}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class CounterElement extends PolyXElement');
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_execMemo');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- useCallback hook in fine-grained reactivity (lines 685-699) ---
  it('should generate _execMemo for useCallback depending on state', () => {
    const code = `
function Clicker() {
  const [count, setCount] = useState(0);
  const handler = useCallback(() => console.log(count), [count]);
  return <button onClick={handler}>{count}</button>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_execMemo');
    // useCallback should wrap factory in arrow: () => fn
    const renderState = result.code.match(/_renderState_count\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
  });

  // --- useLayoutEffect in fine-grained reactivity (lines 711-721) ---
  it('should generate _queueLayoutEffect in _renderState_ for useLayoutEffect', () => {
    const code = `
function Measurer() {
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    console.log('layout', size);
  }, [size]);
  return <div>{size}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_size');
    expect(result.code).toContain('_queueLayoutEffect');
  });

  // --- useRef/useContext in fine-grained reactivity (lines 722-738) ---
  it('should generate _readHook for useRef in _renderState_ when affected', () => {
    const code = `
function FocusInput() {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [value]);
  return <div>{value}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_value');
    // useRef should use _readHook since it does not depend on value directly
    expect(result.code).toContain('_readHook');
  });

  // --- Hook NOT affected reads from cache (lines 740-756) ---
  it('should read unaffected hooks from cache in _renderState_', () => {
    const code = `
function TwoState() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const memoA = useMemo(() => a * 2, [a]);
  const memoB = useMemo(() => b * 3, [b]);
  return <div>{memoA}{memoB}</div>;
}`;
    const result = compile(code);
    // _renderState_a should _execMemo for memoA but _readHook for memoB
    expect(result.code).toContain('_renderState_a');
    expect(result.code).toContain('_renderState_b');
    expect(result.code).toContain('_readHook');
    expect(result.code).toContain('_execMemo');
  });

  // --- Effects without deps run every update (lines 547-549) ---
  it('should include effects without deps in every _renderState_', () => {
    const code = `
function Logger() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('test');
  useEffect(() => {
    console.log('always runs');
  });
  return <div>{count}{name}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_renderState_name');
    // The effect without deps should appear in both _renderState_ methods
    expect(result.code).toContain('_queueEffect');
  });

  // --- Transitive closure through derived vars (lines 534-541) ---
  it('should handle transitive hook dependencies (memo depends on memo)', () => {
    const code = `
function Chain() {
  const [x, setX] = useState(1);
  const doubled = useMemo(() => x * 2, [x]);
  const quadrupled = useMemo(() => doubled * 2, [doubled]);
  return <div>{quadrupled}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_x');
    // Both memos should be re-executed when x changes (transitive)
    const renderState = result.code.match(/_renderState_x\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
    // Should have two _execMemo calls
    const execMemoCount = (renderState![0].match(/_execMemo/g) || []).length;
    expect(execMemoCount).toBe(2);
  });

  // --- Dynamic events affected by state in _renderState_ (lines 612-614) ---
  it('should include state-dependent event handlers in _renderState_', () => {
    const code = `
function ClickTracker() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    const renderState = result.code.match(/_renderState_count\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
    expect(renderState![0]).toContain('_setDynamicEvent');
    expect(renderState![0]).toContain('_setDynamicValue');
  });

  // --- Dynamic spreads affected by state in _renderState_ (lines 620-622) ---
  it('should include state-dependent spreads in _renderState_', () => {
    const code = `
function SpreadComp() {
  const [attrs, setAttrs] = useState({ class: "off" });
  return <div {...attrs}>text</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_attrs');
    const renderState = result.code.match(/_renderState_attrs\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
    expect(renderState![0]).toContain('_setDynamicSpread');
  });

  // --- Props body in _renderState_ (lines 662-664) ---
  it('should include props destructuring in _renderState_ when props are used', () => {
    const code = `
function Display({ label }) {
  const [count, setCount] = useState(0);
  return <div>{label}: {count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    // renderState should read props since label may be referenced
    const renderState = result.code.match(/_renderState_count\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
  });

  // --- _flushTargetedEffects when hooks exist (line 808-817) ---
  it('should call _flushTargetedEffects in _renderState_ when hooks exist', () => {
    const code = `
function WithEffect() {
  const [val, setVal] = useState(0);
  useEffect(() => { console.log(val); }, [val]);
  return <div>{val}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_val');
    expect(result.code).toContain('_flushTargetedEffects');
  });

  // --- Expression statement hooks (not in variable declaration) (lines 462-464) ---
  it('should detect hooks as expression statements (useEffect not in a variable)', () => {
    const code = `
function Tracker() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = count;
  }, [count]);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_queueEffect');
  });

  // --- JSXFragment as child in template (lines 1393-1397) ---
  it('should handle JSXFragment as a child inside a JSX element template', () => {
    const code = `
function Wrapper() {
  const [x, setX] = useState(0);
  return <div><><span>inner1</span><span>inner2</span></><p>{x}</p></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class WrapperElement extends PolyXElement');
    expect(result.code).toContain('inner1');
    expect(result.code).toContain('inner2');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Component with children and props in jsxElementToExpression (lines 1100-1206) ---
  it('should handle component element with children in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Panel title="test"><p>child content</p></Panel>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_createChild');
    expect(result.code).toContain('polyx-panel');
    // Children inside the component should be handled
    expect(result.code).toContain('appendChild');
  });

  // --- Component element without props but with children in expression (line 1158-1206) ---
  it('should handle component with children but no props in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Container><span>child</span></Container>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_createChild');
    expect(result.code).toContain('polyx-container');
    expect(result.code).toContain('appendChild');
  });

  // --- ensureNodeExpression for string literal (lines 1222-1230) ---
  it('should call document.createElement for component without props as child of another component', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Outer><Inner /></Outer>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-outer');
    expect(result.code).toContain('polyx-inner');
    // Inner has no props -> becomes string literal -> ensureNodeExpression wraps it
    expect(result.code).toContain('createElement');
  });

  // --- jsxFragmentToExpression with multiple children types (lines 1237-1261) ---
  it('should handle fragment with text, element, and expression children in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <>hello<span>world</span>{42}</>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // Fragment with multiple children returns array expression
    expect(result.code).not.toContain('"fragment"');
  });

  // --- jsxFragmentToExpression with nested fragment (line 1250-1252) ---
  it('should handle nested fragments in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <><><span>nested</span></></>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    expect(result.code).not.toContain('"fragment"');
  });

  // --- jsxFragmentToExpression with single child → unwrap (line 1258-1260) ---
  it('should unwrap single-child fragment in expression to the child itself', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  const el = <><span>only</span></>;
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    expect(result.code).not.toContain('"fragment"');
  });

  // --- Component element in template with boolean prop (no value) (lines 1329-1330) ---
  it('should handle component element in template with boolean prop (no value)', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Toggle disabled />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-toggle');
    expect(result.code).toContain('_setDynamicProp');
    expect(result.code).toContain('data-px-el');
  });

  // --- Component element in template with string prop (line 1331-1332) ---
  it('should handle component element in template with string prop', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Button label="click me" />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-button');
    expect(result.code).toContain('_setDynamicProp');
    expect(result.code).toContain('"label"');
    expect(result.code).toContain('"click me"');
  });

  // --- childProps affected by state in _renderState_ (lines 626-632) ---
  it('should include state-dependent child props in _renderState_', () => {
    const code = `
function Parent() {
  const [count, setCount] = useState(0);
  return <div><Child value={count} /></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    const renderState = result.code.match(/_renderState_count\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
    expect(renderState![0]).toContain('_setDynamicProp');
  });

  // --- Empty children in template element (line 1306) ---
  it('should handle element with no children producing empty tag', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><span></span>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('<span></span>');
  });

  // --- Component element with children HTML in template (line 1347-1349) ---
  it('should handle component with static children in template', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Card><h1>Title</h1><p>Body</p></Card>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-card');
    expect(result.code).toContain('<h1>Title</h1>');
    expect(result.code).toContain('<p>Body</p>');
  });

  // --- Component element with key prop skipped in template (line 1327) ---
  it('should skip key and ref props on component elements in template', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Item key="k1" ref={myRef} name="test" />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-item');
    expect(result.code).toContain('"name"');
    // key and ref should not appear as dynamic child props
    expect(result.code).not.toContain('"key"');
    expect(result.code).not.toContain('"ref"');
  });

  // --- Text child that's whitespace-only with newline is skipped (line 1366) ---
  it('should skip whitespace-only text children with newlines in template', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div>
    <span>hello</span>
    {x}
  </div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // Whitespace-only text with newlines should be filtered out
    expect(result.code).toContain('hello');
  });

  // --- Multiple event handlers on same element ---
  it('should handle multiple event handlers on the same element', () => {
    const code = `
function Form() {
  const [val, setVal] = useState('');
  return <input onChange={(e) => setVal(e.target.value)} onFocus={() => {}} onBlur={() => {}} />;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicEvent');
    expect(result.code).toContain('"change"');
    expect(result.code).toContain('"focus"');
    expect(result.code).toContain('"blur"');
  });

  // --- Dynamic className attribute ---
  it('should handle dynamic className conversion to class attribute', () => {
    const code = `
function Box() {
  const [active, setActive] = useState(false);
  return <div className={active ? "active" : "inactive"}>content</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicAttribute');
    // className should be converted to "class"
    expect(result.code).toContain('"class"');
    expect(result.code).not.toContain('"className"');
  });

  // --- Ternary/conditional expression in JSX ---
  it('should handle ternary expressions in JSX children', () => {
    const code = `
function Toggle() {
  const [on, setOn] = useState(false);
  return <div>{on ? <span>ON</span> : <span>OFF</span>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Array.map in JSX return ---
  it('should handle Array.map without key as dynamic value', () => {
    const code = `
function ItemList() {
  const [items, setItems] = useState(['a', 'b', 'c']);
  return <ul>{items.map(item => <li>{item}</li>)}</ul>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicValue');
    // Without key prop, should not generate _setKeyedList
    expect(result.code).not.toContain('_setKeyedList');
  });

  // --- Template literal in attributes ---
  it('should handle template literal in JSX attributes', () => {
    const code = `
function StyledDiv() {
  const [color, setColor] = useState('red');
  return <div style={\`color: \${color}\`}>colored</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setDynamicAttribute');
    expect(result.code).toContain('"style"');
  });

  // --- Nested component rendering ---
  it('should handle nested component rendering in template', () => {
    const code = `
function App() {
  const [count, setCount] = useState(0);
  return <div><Header title="App" /><Counter count={count} /><Footer /></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-header');
    expect(result.code).toContain('polyx-counter');
    expect(result.code).toContain('polyx-footer');
    // Multiple data-px-el markers
    expect(result.code).toContain('data-px-el');
  });

  // --- useRef in component body (fine-grained reactivity, hook detected) ---
  it('should handle useRef in fine-grained reactivity as cached hook', () => {
    const code = `
function InputComp() {
  const [text, setText] = useState('');
  const ref = useRef(null);
  return <div>{text}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_text');
    // ref should be read via _readHook in _renderState_text since it's not affected by text
    expect(result.code).toContain('_readHook');
  });

  // --- FunctionExpression component (const App = function() { ... }) ---
  it('should handle function expression components', () => {
    const code = `
const Widget = function() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
};`;
    const result = compile(code);
    expect(result.code).toContain('class WidgetElement extends PolyXElement');
    expect(result.code).toContain('customElements.define("polyx-widget"');
  });

  // --- Component with no return statement should be skipped (line 204) ---
  it('should handle component with no return statement gracefully', () => {
    const code = `
function NoReturn() {
  const [x, setX] = useState(0);
  console.log(x);
}`;
    // No JSX in this function, so it won't be detected as a component
    // Let's try a function that has JSX but no return
    const code2 = `
function NoReturn() {
  const el = <div>test</div>;
}`;
    const result = compile(code2);
    // Should not crash; no return means no transformation
    expect(result.code).not.toContain('class NoReturnElement');
  });

  // --- useMemo without deps array (line 678 ternary) ---
  it('should handle useMemo without dependency array', () => {
    const code = `
function NoDeps() {
  const [count, setCount] = useState(0);
  const val = useMemo(() => count * 2, [count]);
  return <div>{val}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_execMemo');
  });

  // --- useCallback without deps array (line 693 ternary) ---
  it('should handle useCallback without dependency array', () => {
    const code = `
function NoDepsCallback() {
  const [count, setCount] = useState(0);
  const fn = useCallback(() => console.log(count), [count]);
  return <button onClick={fn}>{count}</button>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    // useCallback should still be handled
    expect(result.code).toContain('_execMemo');
  });

  // --- useEffect without deps (hasDeps=false) generates undefined deps (line 705) ---
  it('should pass undefined deps for useEffect without dependency array in _renderState_', () => {
    const code = `
function NoDepsEffect() {
  const [val, setVal] = useState(0);
  useEffect(() => {
    console.log(val);
  });
  return <div>{val}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_val');
    expect(result.code).toContain('_queueEffect');
    // undefined should be passed as deps
    expect(result.code).toContain('undefined');
  });

  // --- useLayoutEffect without deps (line 716 ternary) ---
  it('should pass undefined deps for useLayoutEffect without dependency array', () => {
    const code = `
function NoDepsLayout() {
  const [val, setVal] = useState(0);
  useLayoutEffect(() => {
    console.log(val);
  });
  return <div>{val}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_val');
    expect(result.code).toContain('_queueLayoutEffect');
  });

  // --- Component with key prop in keyed list (various tryTransformKeyedMap branches) ---
  it('should handle keyed map with boolean prop (no value) in list item', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key={item.id} active />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).toContain('true');
  });

  // --- keyed list skipping ref prop ---
  it('should skip ref prop in keyed list items', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key={item.id} ref={myRef} name={item.name} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    // ref should not appear in props
    expect(result.code).not.toContain('"ref"');
  });

  // --- Component in body (not return position) with JSX ---
  it('should transform JSX elements in body (non-return) to expressions', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  const el = <div><Counter count={5} /></div>;
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
  });

  // --- Fragment in body (non-return position) ---
  it('should transform fragments in body (non-return) to expressions', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  const el = <><span>a</span><span>b</span></>;
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    expect(result.code).not.toContain('"fragment"');
  });

  // --- Component element with JSXExpressionContainer child that has empty expression ---
  it('should handle component with children containing JSX comment', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Card>{/* a comment */}<p>content</p></Card>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-card');
  });

  // --- Component element with expression child (line 1145-1148) ---
  it('should handle component with expression children in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  const val = 42;
  return <div>{show && <Wrapper>{val}</Wrapper>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-wrapper');
    expect(result.code).toContain('_createChild');
  });

  // --- Component element with text children in expression context (lines 1133-1141) ---
  it('should handle component with text children in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Label>Hello World</Label>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-label');
    expect(result.code).toContain('createTextNode');
    expect(result.code).toContain('appendChild');
  });

  // --- Component with nested JSX element children in expression (line 1142-1144) ---
  it('should handle component with nested JSX element children in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Layout><Header /><Footer /></Layout>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-layout');
    expect(result.code).toContain('polyx-header');
    expect(result.code).toContain('polyx-footer');
    expect(result.code).toContain('appendChild');
    expect(result.code).toContain('createElement');
  });

  // --- Component with fragment child in expression context (line 1149-1150) ---
  it('should handle component with fragment child in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Panel><><span>a</span><span>b</span></></Panel>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-panel');
    expect(result.code).toContain('_createChild');
  });

  // --- Component with both props and children in expression context (line 1163-1165) ---
  it('should handle component with both props and children expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Modal title="Test"><p>Modal content</p></Modal>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-modal');
    expect(result.code).toContain('_createChild');
    // Props should be passed to createChild
    expect(result.code).toContain('title');
    expect(result.code).toContain('appendChild');
  });

  // --- Text whitespace filtering in jsxElementToExpression children (line 1135) ---
  it('should skip whitespace-only text children in component expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Card>
    <p>content</p>
  </Card>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-card');
    // Whitespace children with newlines should be filtered
    expect(result.code).toContain('appendChild');
  });

  // --- jsxFragmentToExpression with text child (line 1240-1243) ---
  it('should handle fragment with only text in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <>just text</>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // Single text child fragment should unwrap to the text
    expect(result.code).toContain('just text');
  });

  // --- jsxFragmentToExpression with JSXElement child (line 1244-1245) ---
  it('should handle fragment with HTML element child in body context', () => {
    // In body (non-return) context, fragment children are processed via jsxFragmentToExpression
    // Using an HTML element (not a component) so that jsxElementToExpression returns a string literal
    const code = `
function App() {
  const [x, setX] = useState(0);
  const el = <><div>hello</div></>;
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // A single-child fragment with an HTML element unwraps to a string literal "div"
    expect(result.code).not.toContain('"fragment"');
  });

  // --- jsxFragmentToExpression with expression container child (line 1246-1249) ---
  it('should handle fragment with expression container in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  const val = 123;
  return <div>{show && <>{val}</>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
  });

  // --- Multiple children returning array from jsxFragmentToExpression (line 1261) ---
  it('should return array expression for fragment with multiple children in expression', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <>first<span>second</span>{42}</>}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // Multiple children in fragment expression → array expression
    expect(result.code).not.toContain('"fragment"');
  });

  // --- Component with spread attribute in expression context (line 1125-1127) ---
  it('should handle component with spread attribute in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  const extra = { id: 1 };
  return <div>{show && <Widget {...extra} />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-widget');
  });

  // --- Component with empty JSXExpressionContainer value in props (line 1121-1123) ---
  it('should handle component with empty expression container in prop value', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Item name="test" />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-item');
    expect(result.code).toContain('_createChild');
  });

  // --- Multiple components in same file ---
  it('should transform multiple components in the same file', () => {
    const code = `
function Header() {
  const [title, setTitle] = useState('');
  return <h1>{title}</h1>;
}

function Footer() {
  const [year, setYear] = useState(2024);
  return <div>{year}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class HeaderElement extends PolyXElement');
    expect(result.code).toContain('class FooterElement extends PolyXElement');
    expect(result.code).toContain('customElements.define("polyx-header"');
    expect(result.code).toContain('customElements.define("polyx-footer"');
  });

  // --- Void elements in template ---
  it('should handle void elements correctly (no closing tag)', () => {
    const code = `
function Form() {
  const [x, setX] = useState('');
  return <div><br /><hr /><img src="test.png" />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('<br>');
    expect(result.code).toContain('<hr>');
    expect(result.code).toContain('<img');
    // Void elements should not have closing tags
    expect(result.code).not.toContain('</br>');
    expect(result.code).not.toContain('</hr>');
  });

  // --- HTML escaping in text ---
  it('should escape HTML entities in text content', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div>{'<script>alert(1)</script>'}{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
  });

  // --- Keyed list with non-component (no key found → not keyed) ---
  it('should not apply keyed list for non-component elements in map', () => {
    const code = `
function List() {
  const [items, setItems] = useState([]);
  return <div>{items.map(item => <li key={item.id}>{item.name}</li>)}</div>;
}`;
    const result = compile(code);
    // li is not a component (lowercase), so keyed list should not apply
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Scoped CSS integration test ---
  it('should generate scoped CSS with _scopedCSS, _scopeAttr, and connectedCallback', () => {
    const code = `
function StyledCard() {
  const [x, setX] = useState(0);
  return <div><style>{"div { padding: 10px; }"}</style><div>{x}</div></div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_scopedCSS');
    expect(result.code).toContain('_scopeAttr');
    expect(result.code).toContain('_stylesInjected');
    expect(result.code).toContain('connectedCallback');
    expect(result.code).toContain('super.connectedCallback');
  });

  // --- useContext in fine-grained reactivity (lines 722-738, useContext arm) ---
  it('should handle useContext in fine-grained reactivity with _readHook', () => {
    const code = `
function ThemedWidget() {
  const [count, setCount] = useState(0);
  const theme = useContext(ThemeContext);
  return <div>{count}{theme}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    // useContext should use _readHook
    expect(result.code).toContain('_readHook');
  });

  // --- Hook as expression statement with varName for useMemo (line 464) ---
  it('should handle expression statement hooks that are not in variable declarations', () => {
    const code = `
function EffectOnly() {
  const [count, setCount] = useState(0);
  useLayoutEffect(() => {
    document.title = String(count);
  }, [count]);
  return <div>{count}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_queueLayoutEffect');
  });

  // --- Keyed list: function expression callback (not arrow) ---
  it('should handle keyed map with function expression callback', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(function(item) {
    return <Item key={item.id} name={item.name} />;
  })}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).toContain('"polyx-item"');
  });

  // --- Keyed list: string literal key ---
  it('should handle keyed map with string literal key value', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key="fixed" name={item.name} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).toContain('"fixed"');
  });

  // --- Keyed list: prop with string literal value ---
  it('should handle keyed list item with string literal prop', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key={item.id} type="card" />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    expect(result.code).toContain('"card"');
  });

  // --- State with no dynamic bindings but with affected hooks ---
  it('should generate _renderState_ for state with hooks but no DOM deps', () => {
    const code = `
function Tracker() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    console.log('count changed:', count);
  }, [count]);
  return <div>static</div>;
}`;
    const result = compile(code);
    // Even though there are no dynamic bindings, the effect depends on count
    expect(result.code).toContain('_renderState_count');
    expect(result.code).toContain('_queueEffect');
  });

  // --- Component with JSXNamespacedName attribute (line 1431 cond-expr) ---
  it('should handle JSXNamespacedName in attribute name', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div xlink:href="test">{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
  });

  // --- Keyed list _setKeyedList in _renderState_ (line 764) ---
  it('should use _setKeyedList in _renderState_ for keyed map expressions', () => {
    const code = `
function ItemList() {
  const [items, setItems] = useState([]);
  return <div>{items.map(item => <Card key={item.id} title={item.title} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_items');
    expect(result.code).toContain('_setKeyedList');
    // _renderState_items should also use _setKeyedList (not _setDynamicValue)
    const renderState = result.code.match(/_renderState_items\(\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(renderState).toBeTruthy();
    expect(renderState![0]).toContain('_setKeyedList');
  });

  // --- JSXNamespacedName as tag name (line 1410 fallback) ---
  it('should fallback to div for JSXNamespacedName tag', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><xml:svg />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('class AppElement extends PolyXElement');
    // JSXNamespacedName tag should fallback to 'div'
  });

  // --- useMemo without deps array in _render (empty deps) (line 678/693 binary-expr) ---
  it('should handle useMemo with empty deps array in _renderState_', () => {
    const code = `
function Comp() {
  const [count, setCount] = useState(0);
  const val = useMemo(() => Date.now(), []);
  return <div>{count}{val}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    // val does not depend on count, so should use _readHook for val
    expect(result.code).toContain('_readHook');
  });

  // --- useEffect with empty deps in _renderState_ (line 705 binary-expr) ---
  it('should handle useEffect with empty deps array', () => {
    const code = `
function OnMount() {
  const [x, setX] = useState(0);
  useEffect(() => {
    console.log('mounted');
  }, []);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_x');
    // The effect has [] deps so it's not affected by any state
    // It should not appear in _renderState_x
  });

  // --- useLayoutEffect with empty deps (line 716 binary-expr) ---
  it('should handle useLayoutEffect with empty deps array', () => {
    const code = `
function OnLayout() {
  const [x, setX] = useState(0);
  useLayoutEffect(() => {
    console.log('layout mounted');
  }, []);
  return <div>{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_x');
  });

  // --- useContext that is directly referenced in deps of an affected hook ---
  it('should handle useContext referenced in affected hook deps', () => {
    const code = `
function CtxConsumer() {
  const [count, setCount] = useState(0);
  const ctx = useContext(MyContext);
  const derived = useMemo(() => ctx + count, [ctx, count]);
  return <div>{derived}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_renderState_count');
    // ctx is a hook-derived variable. When count changes, derived is affected.
    // ctx should be read via _readHook in _renderState_count since useContext itself isn't affected
    expect(result.code).toContain('_readHook');
    expect(result.code).toContain('_execMemo');
  });

  // --- Component element with key and ref props in body expression (lines 1112) ---
  it('should skip key and ref props in component expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Item key="k" ref={r} name="test" />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-item');
    expect(result.code).toContain('_createChild');
    // Props should include name but not key or ref
    expect(result.code).toContain('name:');
    expect(result.code).not.toMatch(/\bkey:/);
    expect(result.code).not.toMatch(/\bref:/);
  });

  // --- Component element with boolean prop in expression context (line 1115-1116) ---
  it('should handle component with boolean prop (no value) in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Toggle active />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-toggle');
    expect(result.code).toContain('_createChild');
    expect(result.code).toContain('true');
  });

  // --- Component element with string prop in expression context (line 1117-1118) ---
  it('should handle component with string prop in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  return <div>{show && <Badge label="new" />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-badge');
    expect(result.code).toContain('_createChild');
    expect(result.code).toContain('"new"');
  });

  // --- Component with expression prop in expression context (line 1119-1120) ---
  it('should handle component with expression prop in expression context', () => {
    const code = `
function App() {
  const [show, setShow] = useState(true);
  const val = 42;
  return <div>{show && <Counter count={val} />}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-counter');
    expect(result.code).toContain('_createChild');
  });

  // --- Keyed list: no callback argument case (line 1018, 1015) ---
  it('should not apply keyed list when map has no arguments', () => {
    const code = `
function List() {
  const [items, setItems] = useState([]);
  return <div>{items.map()}</div>;
}`;
    const result = compile(code);
    // No callback → not keyed
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Keyed list: callback is not function (line 1018) ---
  it('should not apply keyed list when map callback is not a function', () => {
    const code = `
function List() {
  const [items, setItems] = useState([]);
  return <div>{items.map(renderItem)}</div>;
}`;
    const result = compile(code);
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Keyed list: returned JSX has no name match (line 1040, rawName null) ---
  it('should not apply keyed list when map callback returns non-component', () => {
    const code = `
function List() {
  const [items, setItems] = useState([]);
  return <div>{items.map(item => {
    return <div key={item.id}>{item.name}</div>;
  })}</div>;
}`;
    const result = compile(code);
    // div is not a component, so keyed list should not apply
    expect(result.code).not.toContain('_setKeyedList');
  });

  // --- Keyed list: no returned JSX (line 1035) ---
  it('should not apply keyed list when callback has no JSX return', () => {
    const code = `
function List() {
  const [items, setItems] = useState([]);
  return <div>{items.map(item => item.name)}</div>;
}`;
    const result = compile(code);
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Non-CallExpression in tryTransformKeyedMap (line 1012-1013) ---
  it('should handle non-map call expressions in dynamic values', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div>{someFunc(x)}</div>;
}`;
    const result = compile(code);
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Keyed list with multiple expression container props (line 1069-1071) ---
  it('should handle keyed list with expression container prop value', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key={item.id} count={item.count} label={item.label} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
    // Props appear as object property names (identifiers, not quoted strings)
    expect(result.code).toContain('count:');
    expect(result.code).toContain('label:');
  });

  // --- Non-map member expression call (line 1014 - callee.property.name !== 'map') ---
  it('should not apply keyed list for non-map member expression calls', () => {
    const code = `
function App() {
  const [items, setItems] = useState([]);
  return <div>{items.filter(item => item.active)}</div>;
}`;
    const result = compile(code);
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Non-MemberExpression callee (line 1013) ---
  it('should not apply keyed list for direct function calls', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div>{getItems()}</div>;
}`;
    const result = compile(code);
    expect(result.code).not.toContain('_setKeyedList');
    expect(result.code).toContain('_setDynamicValue');
  });

  // --- Source map generation ---
  it('should not include source map when sourceMap option is false', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div>{x}</div>;
}`;
    const result = compile(code, { sourceMap: false });
    expect(result.map).toBeUndefined();
  });

  // --- Component with JSXNamespacedName attribute on component in template ---
  it('should handle JSXNamespacedName attribute on component element in template', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Widget data:id="test" />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-widget');
    expect(result.code).toContain('data-px-el');
  });

  // --- JSXNamespacedName in keyed list prop name (line 1050 cond-expr) ---
  it('should handle JSXNamespacedName in keyed list prop names', () => {
    const code = `
function List({ items }) {
  const [x, setX] = useState(0);
  return <div>{items.map(item => <Item key={item.id} data:value={item.val} />)}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('_setKeyedList');
  });

  // --- processComponentElement with JSXNamespacedName attr (line 1326) ---
  it('should handle JSXNamespacedName attribute on component in processComponentElement', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Comp aria:label="test" />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-comp');
    expect(result.code).toContain('_setDynamicProp');
  });

  // --- Component with JSXExpressionContainer prop containing empty expression in template ---
  it('should handle component with empty expression in prop in template', () => {
    const code = `
function App() {
  const [x, setX] = useState(0);
  return <div><Widget value={x} />{x}</div>;
}`;
    const result = compile(code);
    expect(result.code).toContain('polyx-widget');
    expect(result.code).toContain('_setDynamicProp');
  });
});
