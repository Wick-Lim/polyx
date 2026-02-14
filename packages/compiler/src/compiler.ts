import { parse as babelParse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { CompilerOptions as CoreCompilerOptions, TransformResult } from '@polyx/core';
import type { NodePath } from '@babel/traverse';
import { extractStyleFromTemplate, scopeCSS } from './css.js';

const traverse = (_traverse as any).default || _traverse;
const generate = (_generate as any).default || _generate;

export type CompilerOptions = CoreCompilerOptions;

export function compile(code: string, options: CompilerOptions = {}): TransformResult {
  const ast = babelParse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  let hasJSX = false;
  const components: Array<{
    name: string;
    path: NodePath<t.FunctionDeclaration | t.VariableDeclarator>;
    func: t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression;
  }> = [];

  // First pass: find components
  traverse(ast, {
    JSXElement() {
      hasJSX = true;
    },
    JSXFragment() {
      hasJSX = true;
    },
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      const name = path.node.id?.name;
      if (name && /^[A-Z]/.test(name)) {
        components.push({ name, path, func: path.node });
      }
    },
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (t.isIdentifier(path.node.id)) {
        const name = path.node.id.name;
        if (/^[A-Z]/.test(name)) {
          const init = path.node.init;
          if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
            components.push({ name, path, func: init });
          }
        }
      }
    },
  });

  // Detect lazy() calls and auto-register custom elements
  const lazyRegistrations: { name: string; path: NodePath<t.VariableDeclarator> }[] = [];
  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (t.isIdentifier(path.node.id)) {
        const name = path.node.id.name;
        if (/^[A-Z]/.test(name)) {
          const init = path.node.init;
          if (t.isCallExpression(init) && t.isIdentifier(init.callee) && init.callee.name === 'lazy') {
            lazyRegistrations.push({ name, path });
          }
        }
      }
    },
  });

  // Insert customElements.define for lazy components
  lazyRegistrations.forEach(({ name, path: lazyPath }) => {
    const tagName = `polyx-${name.toLowerCase()}`;
    const registration = t.expressionStatement(
      t.callExpression(
        t.memberExpression(t.identifier('customElements'), t.identifier('define')),
        [t.stringLiteral(tagName), t.identifier(name)]
      )
    );
    const parent = lazyPath.parentPath;
    if (parent && parent.isVariableDeclaration()) {
      parent.insertAfter(registration);
    }
  });

  if (!hasJSX || components.length === 0) {
    return { code };
  }

  // Transform each component
  components.forEach(({ name, path, func }) => {
    transformComponent(ast, path, name, func);
  });

  // Add runtime imports
  const importDecl = t.importDeclaration(
    [t.importSpecifier(t.identifier('PolyXElement'), t.identifier('PolyXElement'))],
    t.stringLiteral('@polyx/runtime')
  );

  ast.program.body.unshift(importDecl);

  const output = generate(ast, {
    sourceMaps: options.sourceMap,
  });

  return {
    code: output.code,
    map: output.map ? JSON.stringify(output.map) : undefined,
  };
}

function isComponentTag(name: string): boolean {
  return /^[A-Z]/.test(name);
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function transformComponent(
  ast: t.File,
  path: NodePath<t.FunctionDeclaration | t.VariableDeclarator>,
  componentName: string,
  func: t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression
): void {
  const tagName = `polyx-${componentName.toLowerCase()}`;
  const className = `${componentName}Element`;

  // Extract function parameters → props destructuring
  const propsBody: t.Statement[] = [];
  const params = func.params;
  if (params.length > 0) {
    const param = params[0];
    if (t.isObjectPattern(param)) {
      // function Counter({ count, onDone = defaultFn }) → const { count, onDone = defaultFn } = this._props;
      propsBody.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            param,
            t.memberExpression(t.thisExpression(), t.identifier('_props'))
          )
        ])
      );
    } else if (t.isIdentifier(param)) {
      // function Counter(props) → const props = this._props;
      propsBody.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(param.name),
            t.memberExpression(t.thisExpression(), t.identifier('_props'))
          )
        ])
      );
    } else if (t.isAssignmentPattern(param)) {
      // function Counter(props = {}) → const props = this._props;
      if (t.isIdentifier(param.left)) {
        propsBody.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(param.left.name),
              t.memberExpression(t.thisExpression(), t.identifier('_props'))
            )
          ])
        );
      } else if (t.isObjectPattern(param.left)) {
        propsBody.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              param.left,
              t.memberExpression(t.thisExpression(), t.identifier('_props'))
            )
          ])
        );
      }
    }
  }

  // Extract function body
  let body: t.Statement[] = [];
  let returnStatement: t.ReturnStatement | null = null;

  if (t.isFunctionDeclaration(func)) {
    if (t.isBlockStatement(func.body)) {
      body = [...func.body.body];
    }
  } else if (t.isArrowFunctionExpression(func) || t.isFunctionExpression(func)) {
    if (t.isBlockStatement(func.body)) {
      body = [...func.body.body];
    } else {
      returnStatement = t.returnStatement(func.body);
    }
  }

  // Find and remove return statement
  if (body.length > 0) {
    const lastStmt = body[body.length - 1];
    if (t.isReturnStatement(lastStmt)) {
      returnStatement = lastStmt;
      body.pop();
    }
  }

  if (!returnStatement) return;

  // Identify State Variables from useState
  const states: Array<{ name: string; setter: string; default: t.Expression }> = [];
  const stateBody: t.Statement[] = [];

  const filteredBody = body.filter(stmt => {
    if (t.isVariableDeclaration(stmt)) {
      const decl = stmt.declarations[0];
      if (t.isCallExpression(decl.init) && t.isIdentifier(decl.init.callee) && decl.init.callee.name === 'useState') {
        if (t.isArrayPattern(decl.id) && t.isIdentifier(decl.id.elements[0]) && t.isIdentifier(decl.id.elements[1])) {
          states.push({
            name: decl.id.elements[0].name,
            setter: decl.id.elements[1].name,
            default: decl.init.arguments[0] as t.Expression
          });
          return false;
        }
      }
    }
    return true;
  });

  // Create replacements for states
  states.forEach(state => {
    stateBody.push(t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(state.name),
        t.conditionalExpression(
          t.binaryExpression('!==',
            t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(state.name)),
            t.identifier('undefined')
          ),
          t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(state.name)),
          state.default
        )
      )
    ]));

    stateBody.push(t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(state.setter),
        t.arrowFunctionExpression(
          [t.identifier('val')],
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier('_updateState')),
            [
              t.stringLiteral(state.name),
              t.conditionalExpression(
                t.binaryExpression('===', t.unaryExpression('typeof', t.identifier('val')), t.stringLiteral('function')),
                t.callExpression(t.identifier('val'), [
                  t.conditionalExpression(
                    t.binaryExpression('!==',
                      t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(state.name)),
                      t.identifier('undefined')
                    ),
                    t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(state.name)),
                    state.default
                  )
                ]),
                t.identifier('val')
              )
            ]
          )
        )
      )
    ]));
  });

  const finalBody = [...propsBody, ...stateBody, ...filteredBody];

  // Transform JSX in the body (non-return JSX expressions)
  const bodyAST = t.file(t.program(finalBody, [], 'module'));
  transformJSXInBody(bodyAST);
  const transformedBody = bodyAST.program.body;

  // Transform JSX in return statement
  let templateHTML = '';
  const dynamicValues: { expr: t.Expression; slotIdx: number }[] = [];
  const dynamicAttrs: { elementIdx: number; name: string; expr: t.Expression }[] = [];
  const dynamicEvents: { elementIdx: number; event: string; handler: t.Expression }[] = [];
  const dynamicChildProps: { childIdx: number; name: string; expr: t.Expression }[] = [];
  const dynamicSpreads: DynamicSpread[] = [];
  let markerCounter = 0;

  const jsxNode = returnStatement.argument;
  if (t.isJSXElement(jsxNode) || t.isJSXFragment(jsxNode)) {
    templateHTML = jsxToTemplate(jsxNode, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, () => markerCounter++, () => markerCounter++);
  }

  // Scoped CSS processing
  let scopeAttr: string | null = null;
  let scopedCSSText: string | null = null;

  const { html: cleanHTML, style: rawStyle } = extractStyleFromTemplate(templateHTML);
  if (rawStyle) {
    const result = scopeCSS(rawStyle, componentName);
    scopeAttr = result.scopeAttr;
    scopedCSSText = result.css;
    templateHTML = cleanHTML;
    // Add scope attribute to template root — inject it into the first opening tag
    templateHTML = templateHTML.replace(/^(<[a-zA-Z][a-zA-Z0-9-]*)/, `$1 ${scopeAttr}`);
  }

  // Pre-pass: detect keyed map expressions (e.g. items.map(item => <Comp key={item.id} .../>))
  const keyedSlots = new Set<number>();
  dynamicValues.forEach(dv => {
    if (tryTransformKeyedMap(dv.expr)) {
      keyedSlots.add(dv.slotIdx);
    }
  });

  // Transform JSX expressions in dynamic values (e.g. {show && <Counter count={5} />})
  // This also handles any remaining JSX inside keyed map prop values
  dynamicValues.forEach(dv => {
    const exprAST = t.file(t.program([t.expressionStatement(dv.expr)], [], 'module'));
    transformJSXInExpressions(exprAST);
    if (t.isExpressionStatement(exprAST.program.body[0])) {
      dv.expr = exprAST.program.body[0].expression;
    }
  });

  // Create class body members
  const classMembers: any[] = [];

  // 1. static template
  classMembers.push(
    t.classProperty(
      t.identifier('template'),
      t.callExpression(
        t.memberExpression(t.identifier('PolyXElement'), t.identifier('createTemplate')),
        [t.stringLiteral(templateHTML)]
      ),
      null,
      null,
      false,
      true // static
    )
  );

  // 2. static observedAttributes
  classMembers.push(
    t.classMethod(
      'get',
      t.identifier('observedAttributes'),
      [],
      t.blockStatement([
        t.returnStatement(t.arrayExpression(states.map(s => t.stringLiteral(s.name))))
      ]),
      false,
      true // static
    )
  );

  // 3. Getters and Setters for each state
  states.forEach(state => {
    classMembers.push(
      t.classMethod('get', t.identifier(state.name), [], t.blockStatement([
        t.returnStatement(t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(state.name)))
      ]))
    );
    classMembers.push(
      t.classMethod('set', t.identifier(state.name), [t.identifier('v')], t.blockStatement([
        t.expressionStatement(t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('_updateState')), [t.stringLiteral(state.name), t.identifier('v')]))
      ]))
    );
  });

  // 4. _render() method
  const renderBodyStatements: t.Statement[] = [
    ...transformedBody,

    // Set dynamic values (keyed lists use _setKeyedList, others use _setDynamicValue)
    ...dynamicValues.map(({ expr, slotIdx }) =>
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier(
            keyedSlots.has(slotIdx) ? '_setKeyedList' : '_setDynamicValue'
          )),
          [t.numericLiteral(slotIdx), expr]
        )
      )
    ),

    // Set dynamic attributes
    ...dynamicAttrs.map((attr) =>
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier('_setDynamicAttribute')),
          [t.numericLiteral(attr.elementIdx), t.stringLiteral(attr.name), attr.expr]
        )
      )
    ),

    // Set dynamic events
    ...dynamicEvents.map((evt) =>
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier('_setDynamicEvent')),
          [t.numericLiteral(evt.elementIdx), t.stringLiteral(evt.event), evt.handler]
        )
      )
    ),

    // Set dynamic spreads
    ...dynamicSpreads.map((spread) =>
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier('_setDynamicSpread')),
          [t.numericLiteral(spread.elementIdx), spread.expr]
        )
      )
    ),

    // Set dynamic child props
    ...dynamicChildProps.map((prop) =>
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier('_setDynamicProp')),
          [t.numericLiteral(prop.childIdx), t.stringLiteral(prop.name), prop.expr]
        )
      )
    ),
  ];

  classMembers.push(
    t.classMethod('method', t.identifier('_render'), [], t.blockStatement(renderBodyStatements))
  );

  // 5. Fine-grained reactivity: per-state update methods with hook dependency analysis
  // Unlike old approach that skipped _renderState_* when derived hooks exist,
  // we now build a hook dependency graph so _renderState_* can selectively
  // re-execute only affected hooks (via _execMemo/_queueEffect) or read cache (_readHook).
  if (states.length > 0) {
    const stateNames = new Set(states.map(s => s.name));
    const hookTypeNames = new Set(['useMemo', 'useCallback', 'useEffect', 'useLayoutEffect', 'useRef', 'useContext']);

    // Step 1: Collect hook info from filteredBody
    interface HookInfo {
      index: number;
      type: string;
      varName: string | null;
      factoryNode: t.Expression | null;
      depsNode: t.ArrayExpression | null;
      hasDeps: boolean;
      stateDeps: Set<string>;
      hookDeps: Set<string>;
    }

    const hookInfos: HookInfo[] = [];
    let nextHookIndex = 0;

    filteredBody.forEach(stmt => {
      let callExpr: t.CallExpression | null = null;
      let varName: string | null = null;

      if (t.isVariableDeclaration(stmt)) {
        const decl = stmt.declarations[0];
        if (decl && t.isCallExpression(decl.init) && t.isIdentifier(decl.init.callee) && hookTypeNames.has(decl.init.callee.name)) {
          callExpr = decl.init;
          if (t.isIdentifier(decl.id)) varName = decl.id.name;
        }
      } else if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression) && t.isIdentifier(stmt.expression.callee) && hookTypeNames.has(stmt.expression.callee.name)) {
        callExpr = stmt.expression;
      }

      if (!callExpr) return;

      const hookName = (callExpr.callee as t.Identifier).name;
      let factoryNode: t.Expression | null = null;
      let depsNode: t.ArrayExpression | null = null;
      let hasDeps = false;

      if (hookName === 'useMemo' || hookName === 'useCallback' || hookName === 'useEffect' || hookName === 'useLayoutEffect') {
        factoryNode = (callExpr.arguments[0] as t.Expression) || null;
        if (callExpr.arguments.length > 1 && t.isArrayExpression(callExpr.arguments[1])) {
          depsNode = callExpr.arguments[1] as t.ArrayExpression;
          hasDeps = true;
        }
      }

      hookInfos.push({
        index: nextHookIndex++,
        type: hookName,
        varName,
        factoryNode,
        depsNode,
        hasDeps,
        stateDeps: new Set(),
        hookDeps: new Set(),
      });
    });

    // Step 2: Build dependency graph
    const derivedVarNames = new Map<string, number>(); // varName → hookIndex
    hookInfos.forEach(h => {
      if (h.varName) derivedVarNames.set(h.varName, h.index);
    });

    const allTrackableNames = new Set([...stateNames, ...derivedVarNames.keys()]);

    hookInfos.forEach(h => {
      if (h.depsNode) {
        h.depsNode.elements.forEach(elem => {
          if (elem && !t.isSpreadElement(elem)) {
            const refs = findIdentifierRefs(elem as t.Expression, allTrackableNames);
            refs.forEach(ref => {
              if (stateNames.has(ref)) h.stateDeps.add(ref);
              else if (derivedVarNames.has(ref)) h.hookDeps.add(ref);
            });
          }
        });
      }
    });

    // Step 3: Compute affected hooks per state (transitive closure)
    function computeAffectedHooks(stateName: string): Set<number> {
      const affected = new Set<number>();

      // Direct state dependencies
      hookInfos.forEach(h => {
        if (h.stateDeps.has(stateName)) affected.add(h.index);
      });

      // Transitive closure through derived vars
      let changed = true;
      while (changed) {
        changed = false;
        hookInfos.forEach(h => {
          if (affected.has(h.index)) return;
          for (const depVarName of h.hookDeps) {
            const depIdx = derivedVarNames.get(depVarName);
            if (depIdx !== undefined && affected.has(depIdx)) {
              affected.add(h.index);
              changed = true;
              break;
            }
          }
        });
      }

      // Effects without deps arg → run every update
      hookInfos.forEach(h => {
        if ((h.type === 'useEffect' || h.type === 'useLayoutEffect') && !h.hasDeps) {
          affected.add(h.index);
        }
      });

      return affected;
    }

    const affectedHooksPerState = new Map<string, Set<number>>();
    states.forEach(s => {
      affectedHooksPerState.set(s.name, computeAffectedHooks(s.name));
    });

    // Step 4: Compute affected derived var names per state
    const affectedDerivedPerState = new Map<string, Set<string>>();
    states.forEach(s => {
      const affected = affectedHooksPerState.get(s.name)!;
      const derivedNames = new Set<string>();
      hookInfos.forEach(h => {
        if (affected.has(h.index) && h.varName) {
          derivedNames.add(h.varName);
        }
      });
      affectedDerivedPerState.set(s.name, derivedNames);
    });

    // Step 5: Build per-state DOM dependency map (extended with derived vars)
    const stateDepMap = new Map<string, {
      values: { slotIdx: number; expr: t.Expression }[];
      attrs: { elementIdx: number; name: string; expr: t.Expression }[];
      events: { elementIdx: number; event: string; handler: t.Expression }[];
      spreads: { elementIdx: number; expr: t.Expression }[];
      childProps: { childIdx: number; name: string; expr: t.Expression }[];
    }>();

    for (const s of states) {
      stateDepMap.set(s.name, { values: [], attrs: [], events: [], spreads: [], childProps: [] });
    }

    // Check if an expression is affected by a state change (directly or via derived vars)
    function exprAffectsState(expr: t.Expression, stateName: string): boolean {
      const affectedDerived = affectedDerivedPerState.get(stateName)!;
      const checkSet = new Set([stateName, ...affectedDerived]);
      const refs = findIdentifierRefs(expr, checkSet);
      return refs.size > 0;
    }

    dynamicValues.forEach(dv => {
      states.forEach(s => {
        if (exprAffectsState(dv.expr, s.name)) {
          stateDepMap.get(s.name)!.values.push({ slotIdx: dv.slotIdx, expr: dv.expr });
        }
      });
    });

    dynamicAttrs.forEach(da => {
      states.forEach(s => {
        if (exprAffectsState(da.expr, s.name)) {
          stateDepMap.get(s.name)!.attrs.push(da);
        }
      });
    });

    dynamicEvents.forEach(de => {
      states.forEach(s => {
        if (exprAffectsState(de.handler, s.name)) {
          stateDepMap.get(s.name)!.events.push(de);
        }
      });
    });

    dynamicSpreads.forEach(ds => {
      states.forEach(s => {
        if (exprAffectsState(ds.expr, s.name)) {
          stateDepMap.get(s.name)!.spreads.push(ds);
        }
      });
    });

    dynamicChildProps.forEach(dp => {
      states.forEach(s => {
        if (exprAffectsState(dp.expr, s.name)) {
          stateDepMap.get(s.name)!.childProps.push(dp);
        }
      });
    });

    // Step 6: Generate _renderState_{name}() for each state
    stateDepMap.forEach((deps, stateName) => {
      const affected = affectedHooksPerState.get(stateName)!;
      const totalDeps = deps.values.length + deps.attrs.length + deps.events.length + deps.spreads.length + deps.childProps.length;
      const hasAffectedHooks = hookInfos.some(h => affected.has(h.index));

      if (totalDeps === 0 && !hasAffectedHooks) return;

      const methodBody: t.Statement[] = [];

      // Read all current state values
      states.forEach(s => {
        methodBody.push(t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(s.name),
            t.conditionalExpression(
              t.binaryExpression('!==',
                t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(s.name)),
                t.identifier('undefined')
              ),
              t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('_state')), t.identifier(s.name)),
              s.default
            )
          )
        ]));
      });

      // Read props if needed
      if (propsBody.length > 0) {
        methodBody.push(...propsBody);
      }

      // Process hooks in topological order (source order)
      hookInfos.forEach(h => {
        if (affected.has(h.index)) {
          // Hook is affected → re-execute
          switch (h.type) {
            case 'useMemo': {
              methodBody.push(
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(h.varName!),
                    t.callExpression(
                      t.memberExpression(t.thisExpression(), t.identifier('_execMemo')),
                      [t.numericLiteral(h.index), h.factoryNode!, h.depsNode || t.arrayExpression([])]
                    )
                  )
                ])
              );
              break;
            }
            case 'useCallback': {
              // useCallback(fn, deps) → _execMemo(idx, () => fn, deps)
              methodBody.push(
                t.variableDeclaration('const', [
                  t.variableDeclarator(
                    t.identifier(h.varName!),
                    t.callExpression(
                      t.memberExpression(t.thisExpression(), t.identifier('_execMemo')),
                      [t.numericLiteral(h.index), t.arrowFunctionExpression([], h.factoryNode!), h.depsNode || t.arrayExpression([])]
                    )
                  )
                ])
              );
              break;
            }
            case 'useEffect': {
              methodBody.push(
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(t.thisExpression(), t.identifier('_queueEffect')),
                    [t.numericLiteral(h.index), h.factoryNode!, h.hasDeps ? (h.depsNode || t.arrayExpression([])) : t.identifier('undefined')]
                  )
                )
              );
              break;
            }
            case 'useLayoutEffect': {
              methodBody.push(
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(t.thisExpression(), t.identifier('_queueLayoutEffect')),
                    [t.numericLiteral(h.index), h.factoryNode!, h.hasDeps ? (h.depsNode || t.arrayExpression([])) : t.identifier('undefined')]
                  )
                )
              );
              break;
            }
            case 'useRef':
            case 'useContext': {
              if (h.varName) {
                methodBody.push(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      t.identifier(h.varName),
                      t.callExpression(
                        t.memberExpression(t.thisExpression(), t.identifier('_readHook')),
                        [t.numericLiteral(h.index)]
                      )
                    )
                  ])
                );
              }
              break;
            }
          }
        } else {
          // Hook NOT affected → read from cache if it produces a variable
          if (h.varName) {
            methodBody.push(
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  t.identifier(h.varName),
                  t.callExpression(
                    t.memberExpression(t.thisExpression(), t.identifier('_readHook')),
                    [t.numericLiteral(h.index)]
                  )
                )
              ])
            );
          }
          // Effects not affected: skip
        }
      });

      // Generate targeted DOM updates
      deps.values.forEach(({ slotIdx, expr }) => {
        methodBody.push(t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier(
              keyedSlots.has(slotIdx) ? '_setKeyedList' : '_setDynamicValue'
            )),
            [t.numericLiteral(slotIdx), expr]
          )
        ));
      });

      deps.attrs.forEach(attr => {
        methodBody.push(t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier('_setDynamicAttribute')),
            [t.numericLiteral(attr.elementIdx), t.stringLiteral(attr.name), attr.expr]
          )
        ));
      });

      deps.events.forEach(evt => {
        methodBody.push(t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier('_setDynamicEvent')),
            [t.numericLiteral(evt.elementIdx), t.stringLiteral(evt.event), evt.handler]
          )
        ));
      });

      deps.spreads.forEach(spread => {
        methodBody.push(t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier('_setDynamicSpread')),
            [t.numericLiteral(spread.elementIdx), spread.expr]
          )
        ));
      });

      deps.childProps.forEach(prop => {
        methodBody.push(t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier('_setDynamicProp')),
            [t.numericLiteral(prop.childIdx), t.stringLiteral(prop.name), prop.expr]
          )
        ));
      });

      // Flush targeted effects if any hooks exist
      if (hookInfos.length > 0) {
        methodBody.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.thisExpression(), t.identifier('_flushTargetedEffects')),
              []
            )
          )
        );
      }

      classMembers.push(
        t.classMethod('method', t.identifier(`_renderState_${stateName}`), [], t.blockStatement(methodBody))
      );
    });
  }

  // 6. Scoped CSS — static _scopedCSS property and connectedCallback injection
  if (scopedCSSText) {
    classMembers.push(
      t.classProperty(
        t.identifier('_scopedCSS'),
        t.stringLiteral(scopedCSSText),
        null,
        null,
        false,
        true // static
      )
    );

    classMembers.push(
      t.classProperty(
        t.identifier('_scopeAttr'),
        t.stringLiteral(scopeAttr!),
        null,
        null,
        false,
        true // static
      )
    );

    // Override connectedCallback to inject styles once
    classMembers.push(
      t.classMethod(
        'method',
        t.identifier('connectedCallback'),
        [],
        t.blockStatement([
          // Inject scoped styles once per component class
          t.ifStatement(
            t.unaryExpression('!', t.memberExpression(
              t.identifier(className),
              t.identifier('_stylesInjected')
            )),
            t.blockStatement([
              t.expressionStatement(
                t.assignmentExpression('=',
                  t.memberExpression(t.identifier(className), t.identifier('_stylesInjected')),
                  t.booleanLiteral(true)
                )
              ),
              t.variableDeclaration('const', [
                t.variableDeclarator(
                  t.identifier('styleEl'),
                  t.callExpression(
                    t.memberExpression(t.identifier('document'), t.identifier('createElement')),
                    [t.stringLiteral('style')]
                  )
                )
              ]),
              t.expressionStatement(
                t.assignmentExpression('=',
                  t.memberExpression(t.identifier('styleEl'), t.identifier('textContent')),
                  t.memberExpression(t.identifier(className), t.identifier('_scopedCSS'))
                )
              ),
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.identifier('document'), t.identifier('head')),
                    t.identifier('appendChild')
                  ),
                  [t.identifier('styleEl')]
                )
              ),
            ])
          ),
          // Add scope attribute to this element
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.thisExpression(), t.identifier('setAttribute')),
              [
                t.memberExpression(t.identifier(className), t.identifier('_scopeAttr')),
                t.stringLiteral('')
              ]
            )
          ),
          // Call super.connectedCallback()
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.super(), t.identifier('connectedCallback')),
              []
            )
          ),
        ])
      )
    );
  }

  // Create class
  const classDecl = t.classDeclaration(
    t.identifier(className),
    t.identifier('PolyXElement'),
    t.classBody(classMembers)
  );

  // Add customElements.define
  const registration = t.expressionStatement(
    t.callExpression(
      t.memberExpression(t.identifier('customElements'), t.identifier('define')),
      [t.stringLiteral(tagName), t.identifier(className)]
    )
  );

  // Replace component with class + registration
  if (t.isFunctionDeclaration(path.node)) {
    const parentPath = path.parentPath;
    if (parentPath && parentPath.isExportDefaultDeclaration()) {
      parentPath.replaceWithMultiple([
        classDecl,
        registration,
        t.exportDefaultDeclaration(t.identifier(className)),
      ]);
    } else if (parentPath && parentPath.isExportNamedDeclaration()) {
      parentPath.replaceWithMultiple([
        classDecl,
        registration,
        t.exportNamedDeclaration(null, [
          t.exportSpecifier(t.identifier(className), t.identifier(componentName)),
        ]),
      ]);
    } else {
      path.replaceWithMultiple([classDecl, registration]);
    }
  } else {
    const parent = path.parentPath;
    if (parent && parent.isVariableDeclaration()) {
      const grandParent = parent.parentPath;
      if (grandParent && grandParent.isExportNamedDeclaration()) {
        grandParent.replaceWithMultiple([
          classDecl,
          registration,
          t.exportNamedDeclaration(null, [
            t.exportSpecifier(t.identifier(className), t.identifier(componentName)),
          ]),
        ]);
      } else {
        parent.replaceWithMultiple([classDecl, registration]);
      }
    }
  }
}

// Transform JSX elements in body code (non-return) to tag name strings
function transformJSXInBody(ast: t.File): void {
  traverse(ast, {
    JSXElement: {
      exit(path: NodePath<t.JSXElement>) {
        const result = jsxElementToExpression(path.node);
        path.replaceWith(result);
      }
    },
    JSXFragment: {
      exit(path: NodePath<t.JSXFragment>) {
        const result = jsxFragmentToExpression(path.node);
        path.replaceWith(result);
      }
    }
  });
}

// Transform JSX in dynamic expressions (handles component props)
function transformJSXInExpressions(ast: t.File): void {
  traverse(ast, {
    JSXElement: {
      exit(path: NodePath<t.JSXElement>) {
        const result = jsxElementToExpression(path.node);
        path.replaceWith(result);
      }
    },
    JSXFragment: {
      exit(path: NodePath<t.JSXFragment>) {
        const result = jsxFragmentToExpression(path.node);
        path.replaceWith(result);
      }
    }
  });
}

// Detect and transform keyed .map() expressions:
// items.map(item => <Comp key={item.id} ...props />) → items.map(item => ({ key: item.id, tag: "polyx-comp", props: {...} }))
// Returns true if transformation was applied (key prop found in map callback's JSX).
function tryTransformKeyedMap(expr: t.Expression): boolean {
  // Check pattern: something.map(callback)
  if (!t.isCallExpression(expr)) return false;
  if (!t.isMemberExpression(expr.callee)) return false;
  if (!t.isIdentifier(expr.callee.property) || expr.callee.property.name !== 'map') return false;
  if (expr.arguments.length < 1) return false;

  const callback = expr.arguments[0];
  if (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) return false;

  // Find the returned JSX element
  let returnedJSX: t.JSXElement | null = null;
  let returnStmt: t.ReturnStatement | null = null;

  if (t.isArrowFunctionExpression(callback) && t.isJSXElement(callback.body)) {
    returnedJSX = callback.body;
  } else if (t.isBlockStatement((callback as any).body)) {
    const body = ((callback as any).body as t.BlockStatement).body;
    const lastStmt = body[body.length - 1];
    if (t.isReturnStatement(lastStmt) && t.isJSXElement(lastStmt.argument)) {
      returnedJSX = lastStmt.argument;
      returnStmt = lastStmt;
    }
  }

  if (!returnedJSX) return false;

  // Must be a component element (capital first letter)
  const rawName = t.isJSXIdentifier(returnedJSX.openingElement.name)
    ? returnedJSX.openingElement.name.name : null;
  if (!rawName || !isComponentTag(rawName)) return false;

  const tagName = `polyx-${rawName.toLowerCase()}`;

  // Extract key and other props
  let keyExpr: t.Expression | null = null;
  const propEntries: t.ObjectProperty[] = [];

  for (const attr of returnedJSX.openingElement.attributes) {
    if (t.isJSXAttribute(attr)) {
      const name = t.isJSXIdentifier(attr.name) ? attr.name.name : (attr.name as any).name.name;

      if (name === 'key') {
        if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression((attr.value as t.JSXExpressionContainer).expression)) {
          keyExpr = (attr.value as t.JSXExpressionContainer).expression as t.Expression;
        } else if (t.isStringLiteral(attr.value)) {
          keyExpr = attr.value;
        }
        continue;
      }
      if (name === 'ref') continue;

      let value: t.Expression;
      if (!attr.value) {
        value = t.booleanLiteral(true);
      } else if (t.isStringLiteral(attr.value)) {
        value = attr.value;
      } else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression((attr.value as t.JSXExpressionContainer).expression)) {
        value = (attr.value as t.JSXExpressionContainer).expression as t.Expression;
      } else {
        continue;
      }
      propEntries.push(t.objectProperty(t.identifier(name), value));
    }
  }

  if (!keyExpr) return false; // No key found → not keyed

  // Build descriptor: { key: keyExpr, tag: "polyx-tagname", props: { ...props } }
  const descriptorExpr = t.objectExpression([
    t.objectProperty(t.identifier('key'), keyExpr),
    t.objectProperty(t.identifier('tag'), t.stringLiteral(tagName)),
    t.objectProperty(t.identifier('props'), t.objectExpression(propEntries)),
  ]);

  // Replace callback body with descriptor
  if (t.isArrowFunctionExpression(callback) && !t.isBlockStatement(callback.body)) {
    // Arrow with expression body → replace directly
    (callback as t.ArrowFunctionExpression).body = descriptorExpr;
  } else if (returnStmt) {
    // Block body → replace return argument
    returnStmt.argument = descriptorExpr;
  }

  return true;
}

// Convert a JSX element to an expression:
// - For component elements with props: this._createChild("polyx-name", { prop1: val1, ... })
// - For component elements without props: "polyx-name" (string literal)
// - For component elements with children: IIFE that creates parent, appends children, returns parent
// - For HTML elements: "tagname" (string literal)
function jsxElementToExpression(node: t.JSXElement): t.Expression {
  const tagName = getTagName(node.openingElement.name);
  const rawName = t.isJSXIdentifier(node.openingElement.name) ? node.openingElement.name.name : tagName;

  if (isComponentTag(rawName)) {
    // Collect props from attributes
    const propEntries: t.ObjectProperty[] = [];
    for (const attr of node.openingElement.attributes) {
      if (t.isJSXAttribute(attr)) {
        const name = t.isJSXIdentifier(attr.name) ? attr.name.name : attr.name.name.name;
        if (name === 'key' || name === 'ref') continue;

        let value: t.Expression;
        if (!attr.value) {
          value = t.booleanLiteral(true);
        } else if (t.isStringLiteral(attr.value)) {
          value = attr.value;
        } else if (t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
          value = attr.value.expression as t.Expression;
        } else {
          continue;
        }
        propEntries.push(t.objectProperty(t.identifier(name), value));
      } else if (t.isJSXSpreadAttribute(attr)) {
        // Spread attributes: handled in Phase 8
      }
    }

    // Collect children as DOM-creating expressions
    const childAppendExprs: t.Expression[] = [];
    for (const child of node.children) {
      if (t.isJSXText(child)) {
        const text = child.value;
        if (text.trim() === '' && text.includes('\n')) continue;
        childAppendExprs.push(
          t.callExpression(
            t.memberExpression(t.identifier('document'), t.identifier('createTextNode')),
            [t.stringLiteral(text)]
          )
        );
      } else if (t.isJSXElement(child)) {
        // Still a JSXElement — convert recursively, ensure it produces a Node
        childAppendExprs.push(ensureNodeExpression(jsxElementToExpression(child)));
      } else if (t.isJSXExpressionContainer(child)) {
        if (!t.isJSXEmptyExpression(child.expression)) {
          childAppendExprs.push(child.expression as t.Expression);
        }
      } else if (t.isJSXFragment(child)) {
        childAppendExprs.push(jsxFragmentToExpression(child));
      } else {
        // Already-transformed expression from exit traversal (CallExpression, StringLiteral, etc.)
        childAppendExprs.push(ensureNodeExpression(child as unknown as t.Expression));
      }
    }

    // If children present, use IIFE: create parent, append children, return parent
    if (childAppendExprs.length > 0) {
      const stmts: t.Statement[] = [];

      // const _el = this._createChild("polyx-tag", {props});
      const createArgs: t.Expression[] = [t.stringLiteral(tagName)];
      if (propEntries.length > 0) {
        createArgs.push(t.objectExpression(propEntries));
      }
      stmts.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('_el'),
            t.callExpression(
              t.memberExpression(t.thisExpression(), t.identifier('_createChild')),
              createArgs
            )
          )
        ])
      );

      // Append each child with instanceof Node guard
      childAppendExprs.forEach((expr, i) => {
        const tempId = t.identifier(`_c${i}`);
        stmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(tempId, expr)
          ])
        );
        stmts.push(
          t.ifStatement(
            t.binaryExpression('instanceof', tempId, t.identifier('Node')),
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(t.identifier('_el'), t.identifier('appendChild')),
                [tempId]
              )
            )
          )
        );
      });

      // return _el;
      stmts.push(t.returnStatement(t.identifier('_el')));

      return t.callExpression(
        t.arrowFunctionExpression([], t.blockStatement(stmts)),
        []
      );
    }

    // No children
    if (propEntries.length > 0) {
      return t.callExpression(
        t.memberExpression(t.thisExpression(), t.identifier('_createChild')),
        [t.stringLiteral(tagName), t.objectExpression(propEntries)]
      );
    }
    return t.stringLiteral(tagName);
  }

  return t.stringLiteral(tagName);
}

// Ensure an expression evaluates to a DOM Node (not a string tag name)
function ensureNodeExpression(expr: t.Expression): t.Expression {
  if (t.isStringLiteral(expr)) {
    // Tag name string like "polyx-foo" or "div" → document.createElement()
    return t.callExpression(
      t.memberExpression(t.identifier('document'), t.identifier('createElement')),
      [expr]
    );
  }
  return expr;
}

// Convert a JSX fragment to an expression:
// - Single child: return the child expression directly
// - Multiple children: return an array expression
// - No children: return empty string
function jsxFragmentToExpression(node: t.JSXFragment): t.Expression {
  const childExprs: t.Expression[] = [];
  for (const child of node.children) {
    if (t.isJSXText(child)) {
      const text = child.value;
      if (text.trim() === '' && text.includes('\n')) continue;
      childExprs.push(t.stringLiteral(text));
    } else if (t.isJSXElement(child)) {
      childExprs.push(jsxElementToExpression(child));
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        childExprs.push(child.expression as t.Expression);
      }
    } else if (t.isJSXFragment(child)) {
      childExprs.push(jsxFragmentToExpression(child));
    }
  }

  if (childExprs.length === 0) {
    return t.stringLiteral('');
  }
  if (childExprs.length === 1) {
    return childExprs[0];
  }
  return t.arrayExpression(childExprs);
}

function jsxToTemplate(
  node: t.JSXElement | t.JSXFragment,
  dynamicValues: { expr: t.Expression; slotIdx: number }[],
  dynamicAttrs: { elementIdx: number; name: string; expr: t.Expression }[],
  dynamicEvents: { elementIdx: number; event: string; handler: t.Expression }[],
  dynamicChildProps: { childIdx: number; name: string; expr: t.Expression }[],
  dynamicSpreads: DynamicSpread[],
  getElementIdx: () => number,
  getChildIdx: () => number,
  parentTag?: string
): string {
  if (t.isJSXFragment(node)) {
    return node.children
      .map(child => jsxChildToTemplate(child, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, getElementIdx, getChildIdx, parentTag))
      .filter(Boolean)
      .join('');
  }

  const elementIdx = getElementIdx();
  const tagName = getTagName(node.openingElement.name);
  const rawName = t.isJSXIdentifier(node.openingElement.name) ? node.openingElement.name.name : tagName;

  // Check if this is a component element
  if (isComponentTag(rawName)) {
    return processComponentElement(node, tagName, dynamicChildProps, dynamicValues, dynamicAttrs, dynamicEvents, dynamicSpreads, getChildIdx, getElementIdx);
  }

  const attrs = processAttributes(node.openingElement.attributes, elementIdx, dynamicAttrs, dynamicEvents, dynamicSpreads);

  // Void elements (input, br, img, etc.) have no closing tag in HTML
  if (VOID_ELEMENTS.has(tagName)) {
    return `<${tagName}${attrs}>`;
  }

  const children = node.children
    .map(child => jsxChildToTemplate(child, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, getElementIdx, getChildIdx, tagName))
    .filter(Boolean)
    .join('');

  if (children) {
    return `<${tagName}${attrs}>${children}</${tagName}>`;
  }
  return `<${tagName}${attrs}></${tagName}>`;
}

// Process a component element in the template — extracts props as dynamicChildProps
function processComponentElement(
  node: t.JSXElement,
  tagName: string,
  dynamicChildProps: { childIdx: number; name: string; expr: t.Expression }[],
  dynamicValues: { expr: t.Expression; slotIdx: number }[],
  dynamicAttrs: { elementIdx: number; name: string; expr: t.Expression }[],
  dynamicEvents: { elementIdx: number; event: string; handler: t.Expression }[],
  dynamicSpreads: DynamicSpread[],
  getChildIdx: () => number,
  getElementIdx: () => number
): string {
  const childIdx = getChildIdx();
  const staticAttrs: string[] = [`data-px-el="${childIdx}"`];

  for (const attr of node.openingElement.attributes) {
    if (t.isJSXAttribute(attr)) {
      const name = t.isJSXIdentifier(attr.name) ? attr.name.name : attr.name.name.name;
      if (name === 'key' || name === 'ref') continue;

      if (!attr.value) {
        dynamicChildProps.push({ childIdx, name, expr: t.booleanLiteral(true) });
      } else if (t.isStringLiteral(attr.value)) {
        dynamicChildProps.push({ childIdx, name, expr: attr.value });
      } else if (t.isJSXExpressionContainer(attr.value)) {
        if (!t.isJSXEmptyExpression(attr.value.expression)) {
          dynamicChildProps.push({ childIdx, name, expr: attr.value.expression as t.Expression });
        }
      }
    }
  }

  // Process children content — compile child nodes into HTML that goes inside the component element
  const childrenHTML = node.children
    .map(child => jsxChildToTemplate(child, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, getElementIdx, getChildIdx, undefined))
    .filter(Boolean)
    .join('');

  if (childrenHTML) {
    return `<${tagName} ${staticAttrs.join(' ')}>${childrenHTML}</${tagName}>`;
  }
  return `<${tagName} ${staticAttrs.join(' ')}></${tagName}>`;
}

function jsxChildToTemplate(
  child: t.JSXElement['children'][number],
  dynamicValues: { expr: t.Expression; slotIdx: number }[],
  dynamicAttrs: { elementIdx: number; name: string; expr: t.Expression }[],
  dynamicEvents: { elementIdx: number; event: string; handler: t.Expression }[],
  dynamicChildProps: { childIdx: number; name: string; expr: t.Expression }[],
  dynamicSpreads: DynamicSpread[],
  getElementIdx: () => number,
  getChildIdx: () => number,
  parentTag?: string
): string {
  if (t.isJSXText(child)) {
    const text = child.value;
    if (text.trim() === '' && text.includes('\n')) return '';
    return escapeHTML(text);
  }

  if (t.isJSXExpressionContainer(child)) {
    if (t.isJSXEmptyExpression(child.expression)) return '';

    // Inside <style> tags, inline string/template literals as static CSS text
    if (parentTag === 'style') {
      const expr = child.expression;
      if (t.isStringLiteral(expr)) {
        return expr.value;
      }
      if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) {
        return expr.quasis[0].value.cooked || expr.quasis[0].value.raw;
      }
    }

    const slotIdx = dynamicValues.length;
    dynamicValues.push({ expr: child.expression as t.Expression, slotIdx });
    return `<span data-dyn="${slotIdx}"></span>`;
  }

  if (t.isJSXElement(child)) {
    return jsxToTemplate(child, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, getElementIdx, getChildIdx, parentTag);
  }

  if (t.isJSXFragment(child)) {
    return jsxToTemplate(child, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, getElementIdx, getChildIdx, parentTag);
  }

  return '';
}

function getTagName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) {
    if (/^[A-Z]/.test(name.name)) {
      return `polyx-${name.name.toLowerCase()}`;
    }
    return name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    return generate(name).code;
  }
  return 'div';
}

// Track spread attributes for runtime application
interface DynamicSpread {
  elementIdx: number;
  expr: t.Expression;
}

function processAttributes(
  attributes: t.JSXOpeningElement['attributes'],
  elementIdx: number,
  dynamicAttrs: { elementIdx: number; name: string; expr: t.Expression }[],
  dynamicEvents: { elementIdx: number; event: string; handler: t.Expression }[],
  dynamicSpreads?: DynamicSpread[]
): string {
  const attrs: string[] = [];
  let hasDynamic = false;

  for (const attr of attributes) {
    if (t.isJSXAttribute(attr)) {
      let name = t.isJSXIdentifier(attr.name) ? attr.name.name : attr.name.name.name;
      if (name === 'className') name = 'class';

      if (!attr.value) {
        attrs.push(name);
      } else if (t.isStringLiteral(attr.value)) {
        attrs.push(`${name}="${escapeHTML(attr.value.value)}"`);
      } else if (t.isJSXExpressionContainer(attr.value)) {
        const expr = attr.value.expression;

        if (name.startsWith('on')) {
          const eventName = name.slice(2).toLowerCase();
          dynamicEvents.push({ elementIdx, event: eventName, handler: expr as t.Expression });
        } else {
          dynamicAttrs.push({ elementIdx, name, expr: expr as t.Expression });
        }
        hasDynamic = true;
      }
    } else if (t.isJSXSpreadAttribute(attr)) {
      if (dynamicSpreads) {
        dynamicSpreads.push({ elementIdx, expr: attr.argument });
      }
      hasDynamic = true;
    }
  }

  // Emit single unified marker when any dynamic bindings exist
  if (hasDynamic) {
    attrs.push(`data-px-el="${elementIdx}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

// Find which identifiers from a known set are referenced in an expression
function findIdentifierRefs(expr: t.Expression, knownNames: Set<string>): Set<string> {
  const refs = new Set<string>();
  const exprAST = t.file(t.program([t.expressionStatement(expr)], [], 'module'));
  traverse(exprAST, {
    Identifier(path: NodePath<t.Identifier>) {
      if (knownNames.has(path.node.name)) {
        refs.add(path.node.name);
      }
    },
    noScope: true
  });
  return refs;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
