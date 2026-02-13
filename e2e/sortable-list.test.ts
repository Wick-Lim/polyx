/**
 * E2E tests for the sortable-list example.
 * Imports JSX components directly — the polyx vite-plugin compiles them
 * and registers Custom Elements automatically.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { flushAll, mount, click, cleanup, q, qAll } from './helpers';

// Import components — triggers compile + customElements.define
import '../examples/sortable-list/src/components/ListRow.jsx';
import '../examples/sortable-list/src/components/ListStats.jsx';
import '../examples/sortable-list/src/components/Controls.jsx';
import '../examples/sortable-list/src/components/SortableList.jsx';
import '../examples/sortable-list/src/components/App.jsx';

afterEach(() => cleanup());

// ── helpers ──

function getApp() {
  return q(document, 'polyx-app')!;
}

function getRows(app: Element): Element[] {
  return qAll(app, 'polyx-listrow');
}

function getButtons(app: Element): Element[] {
  return qAll(app, 'button');
}

function getButtonByText(app: Element, text: string): Element {
  const btn = getButtons(app).find((b) => b.textContent?.trim().startsWith(text));
  if (!btn) throw new Error(`Button "${text}" not found`);
  return btn;
}

function getRowId(row: Element): number {
  const rank = q(row, '.row-rank');
  return parseInt(rank?.textContent?.trim() || '0', 10);
}

function getRowName(row: Element): string {
  const nameEl = q(row, '.row-name');
  return nameEl?.textContent?.trim() || '';
}

function getRowCategory(row: Element): string {
  const catEl = q(row, '.row-category');
  return catEl?.textContent?.trim() || '';
}

function getStatsText(app: Element): string {
  const stats = q(app, 'polyx-liststats');
  return stats?.textContent || '';
}

// ── initial render ──

describe('sortable-list: initial render', () => {
  it('should show the title', async () => {
    const app = await mount('polyx-app');
    expect(app.textContent).toContain('Sortable List (200 items)');
  });

  it('should render 200 rows', async () => {
    const app = await mount('polyx-app');
    expect(getRows(app).length).toBe(200);
  });

  it('should render 6 buttons (4 sort + shuffle + reverse)', async () => {
    const app = await mount('polyx-app');
    expect(getButtons(app).length).toBe(6);
  });

  it('should show stats with total 200 and no selection', async () => {
    const app = await mount('polyx-app');
    const text = getStatsText(app);
    expect(text).toContain('200');
    expect(text).toContain('None');
  });

  it('should initially sort by ID ascending (1,2,3…)', async () => {
    const app = await mount('polyx-app');
    const rows = getRows(app);
    expect(getRowId(rows[0])).toBe(1);
    expect(getRowId(rows[1])).toBe(2);
    expect(getRowId(rows[199])).toBe(200);
  });

  it('should have ID button active', async () => {
    const app = await mount('polyx-app');
    const idBtn = getButtonByText(app, 'ID');
    expect(idBtn.className).toContain('active');
  });
});

// ── sorting ──

describe('sortable-list: sorting', () => {
  it('should toggle direction when clicking active sort button', async () => {
    const app = await mount('polyx-app');
    const idBtn = getButtonByText(app, 'ID');

    // Initially asc → first row is 1
    expect(getRowId(getRows(app)[0])).toBe(1);

    // Click ID again → desc
    await click(idBtn);
    expect(getRowId(getRows(app)[0])).toBe(200);
  });

  it('should sort by Name when Name button is clicked', async () => {
    const app = await mount('polyx-app');
    const nameBtn = getButtonByText(app, 'Name');
    await click(nameBtn);

    const rows = getRows(app);
    const first = getRowName(rows[0]);
    const second = getRowName(rows[1]);
    // Ascending alphabetical: first should be <= second
    expect(first.localeCompare(second)).toBeLessThanOrEqual(0);
  });

  it('should sort by Category when Category button is clicked', async () => {
    const app = await mount('polyx-app');
    const catBtn = getButtonByText(app, 'Category');
    await click(catBtn);

    const rows = getRows(app);
    const first = getRowCategory(rows[0]);
    const second = getRowCategory(rows[1]);
    expect(first.localeCompare(second)).toBeLessThanOrEqual(0);
  });
});

// ── reverse ──

describe('sortable-list: reverse', () => {
  it('should reverse the sort direction', async () => {
    const app = await mount('polyx-app');
    const reverseBtn = getButtonByText(app, 'Reverse');

    // Default: ID asc → first = 1
    expect(getRowId(getRows(app)[0])).toBe(1);

    await click(reverseBtn);
    // Now desc → first = 200
    expect(getRowId(getRows(app)[0])).toBe(200);
  });
});

// ── shuffle ──

describe('sortable-list: shuffle', () => {
  it('should maintain 200 rows after shuffle', async () => {
    const app = await mount('polyx-app');
    const shuffleBtn = getButtonByText(app, 'Shuffle');
    await click(shuffleBtn);
    expect(getRows(app).length).toBe(200);
  });
});

// ── selection ──

/** Click the inner .list-row div (where the click handler is bound). */
async function clickRow(row: Element): Promise<void> {
  const inner = q(row, '.list-row') || row;
  await click(inner);
}

describe('sortable-list: selection', () => {
  it('should select a row on click', async () => {
    const app = await mount('polyx-app');
    const rows = getRows(app);
    await clickRow(rows[0]);

    const stats = getStatsText(app);
    expect(stats).toContain('#1');
  });

  it('should deselect a row when clicking it again', async () => {
    const app = await mount('polyx-app');
    const rows = getRows(app);
    await clickRow(rows[0]);
    expect(getStatsText(app)).toContain('#1');

    await clickRow(getRows(app)[0]);
    expect(getStatsText(app)).toContain('None');
  });

  it('should change selection when clicking a different row', async () => {
    const app = await mount('polyx-app');
    const rows = getRows(app);
    await clickRow(rows[0]);
    expect(getStatsText(app)).toContain('#1');

    await clickRow(getRows(app)[2]);
    expect(getStatsText(app)).toContain('#3');
  });

  it('should keep selection after sorting', async () => {
    const app = await mount('polyx-app');
    // Select row with ID 5
    const rows = getRows(app);
    await clickRow(rows[4]); // ID 5 at index 4
    expect(getStatsText(app)).toContain('#5');

    // Sort by Name
    const nameBtn = getButtonByText(app, 'Name');
    await click(nameBtn);

    // Selection should be preserved (selectedId stays 5)
    expect(getStatsText(app)).toContain('#5');
  });
});

// ── list integrity ──

describe('sortable-list: list integrity', () => {
  it('should have correct name data for first rows', async () => {
    const app = await mount('polyx-app');
    const rows = getRows(app);
    // Item 1: FIRST_NAMES[0] + ' ' + LAST_NAMES[0] = 'Alice Anderson'
    expect(getRowName(rows[0])).toBe('Alice Anderson');
    // Item 2: FIRST_NAMES[1] + ' ' + LAST_NAMES[0] = 'Bob Anderson'
    expect(getRowName(rows[1])).toBe('Bob Anderson');
  });

  it('should render score bars with width style', async () => {
    const app = await mount('polyx-app');
    const fills = qAll(app, '.score-fill');
    expect(fills.length).toBe(200);
    // Each fill should have a width style (percentage)
    const firstStyle = (fills[0] as HTMLElement).getAttribute('style') || '';
    expect(firstStyle).toContain('width:');
  });

  it('should maintain 200 rows after multiple sort operations', async () => {
    const app = await mount('polyx-app');
    const nameBtn = getButtonByText(app, 'Name');
    const catBtn = getButtonByText(app, 'Category');
    const idBtn = getButtonByText(app, 'ID');

    await click(nameBtn);
    await click(catBtn);
    await click(idBtn);
    await click(nameBtn);

    expect(getRows(app).length).toBe(200);
  });
});
