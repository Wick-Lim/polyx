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
  let elementCounter = 0;
  let childCounter = 0;

  const jsxNode = returnStatement.argument;
  if (t.isJSXElement(jsxNode) || t.isJSXFragment(jsxNode)) {
    templateHTML = jsxToTemplate(jsxNode, dynamicValues, dynamicAttrs, dynamicEvents, dynamicChildProps, dynamicSpreads, () => elementCounter++, () => childCounter++);
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

  // Transform JSX expressions in dynamic values (e.g. {show && <Counter count={5} />})
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

    // Set dynamic values
    ...dynamicValues.map(({ expr, slotIdx }) =>
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.thisExpression(), t.identifier('_setDynamicValue')),
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

  // 5. Fine-grained reactivity: per-state update methods
  // Skip when component body uses hooks that create derived values (useMemo, useCallback, etc.)
  // because _renderState_* methods can't re-execute those hooks
  const derivedHookNames = new Set(['useMemo', 'useCallback', 'useEffect', 'useLayoutEffect', 'useRef', 'useContext']);
  let hasDerivedHooks = false;
  const bodyCheckAST = t.file(t.program(filteredBody, [], 'module'));
  traverse(bodyCheckAST, {
    CallExpression(checkPath: NodePath<t.CallExpression>) {
      if (t.isIdentifier(checkPath.node.callee) && derivedHookNames.has(checkPath.node.callee.name)) {
        hasDerivedHooks = true;
        checkPath.stop();
      }
    },
    noScope: true
  });

  if (states.length > 0 && !hasDerivedHooks) {
    const stateNames = new Set(states.map(s => s.name));

    // Build per-state dependency map
    const stateDepMap = new Map<string, {
      values: { slotIdx: number; expr: t.Expression }[];
      attrs: { elementIdx: number; name: string; expr: t.Expression }[];
      events: { elementIdx: number; event: string; handler: t.Expression }[];
      spreads: { elementIdx: number; expr: t.Expression }[];
      childProps: { childIdx: number; name: string; expr: t.Expression }[];
    }>();

    // Initialize map entries
    for (const s of states) {
      stateDepMap.set(s.name, { values: [], attrs: [], events: [], spreads: [], childProps: [] });
    }

    // Analyze dynamic values
    dynamicValues.forEach(dv => {
      const deps = findIdentifierRefs(dv.expr, stateNames);
      deps.forEach(dep => stateDepMap.get(dep)!.values.push({ slotIdx: dv.slotIdx, expr: dv.expr }));
    });

    // Analyze dynamic attributes
    dynamicAttrs.forEach(da => {
      const deps = findIdentifierRefs(da.expr, stateNames);
      deps.forEach(dep => stateDepMap.get(dep)!.attrs.push(da));
    });

    // Analyze dynamic events
    dynamicEvents.forEach(de => {
      const deps = findIdentifierRefs(de.handler, stateNames);
      deps.forEach(dep => stateDepMap.get(dep)!.events.push(de));
    });

    // Analyze spreads
    dynamicSpreads.forEach(ds => {
      const deps = findIdentifierRefs(ds.expr, stateNames);
      deps.forEach(dep => stateDepMap.get(dep)!.spreads.push(ds));
    });

    // Analyze child props
    dynamicChildProps.forEach(dp => {
      const deps = findIdentifierRefs(dp.expr, stateNames);
      deps.forEach(dep => stateDepMap.get(dep)!.childProps.push(dp));
    });

    // Generate _renderState_{name}() for each state with dependencies
    stateDepMap.forEach((deps, stateName) => {
      const totalDeps = deps.values.length + deps.attrs.length + deps.events.length + deps.spreads.length + deps.childProps.length;
      if (totalDeps === 0) return;

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

      // Generate targeted _setDynamic* calls
      deps.values.forEach(({ slotIdx, expr }) => {
        methodBody.push(t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.thisExpression(), t.identifier('_setDynamicValue')),
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
  const staticAttrs: string[] = [`data-child-idx="${childIdx}"`];

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
          attrs.push(`data-event-${eventName}="${elementIdx}"`);
        } else {
          dynamicAttrs.push({ elementIdx, name, expr: expr as t.Expression });
          attrs.push(`data-attr-${name}="${elementIdx}"`);
        }
      }
    } else if (t.isJSXSpreadAttribute(attr)) {
      // {...props} spread — mark for runtime application
      if (dynamicSpreads) {
        dynamicSpreads.push({ elementIdx, expr: attr.argument });
      }
      attrs.push(`data-spread="${elementIdx}"`);
    }
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
