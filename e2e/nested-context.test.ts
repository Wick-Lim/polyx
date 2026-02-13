/**
 * E2E tests for the nested-context example.
 * Tests 3-level context provider nesting with 9 components.
 *
 * Provider hierarchy (as in index.html):
 *   polyx-ctx-provider-1 (UserContext)
 *     > polyx-ctx-provider-2 (PreferencesContext)
 *       > polyx-ctx-provider-3 (PermissionsContext)
 *         > polyx-app
 */
import { describe, it, expect, afterEach } from 'vitest';
import { flushAll, click, cleanup, q, qAll } from './helpers';

// Import contexts FIRST to ensure provider IDs are 1, 2, 3
import '../examples/nested-context/src/contexts.js';
// Then import all components
import '../examples/nested-context/src/components/Badge.jsx';
import '../examples/nested-context/src/components/NavItem.jsx';
import '../examples/nested-context/src/components/SettingRow.jsx';
import '../examples/nested-context/src/components/UserBadge.jsx';
import '../examples/nested-context/src/components/Sidebar.jsx';
import '../examples/nested-context/src/components/Header.jsx';
import '../examples/nested-context/src/components/SettingsPanel.jsx';
import '../examples/nested-context/src/components/App.jsx';

afterEach(() => cleanup());

// ── helpers ──

/** Mount the nested provider structure: provider-1 > provider-2 > provider-3 > polyx-app */
async function mountWithProviders(): Promise<{
  provider1: HTMLElement;
  provider2: HTMLElement;
  provider3: HTMLElement;
  app: HTMLElement;
}> {
  const provider1 = document.createElement('polyx-ctx-provider-1');
  const provider2 = document.createElement('polyx-ctx-provider-2');
  const provider3 = document.createElement('polyx-ctx-provider-3');
  const app = document.createElement('polyx-app');

  provider3.appendChild(app);
  provider2.appendChild(provider3);
  provider1.appendChild(provider2);
  document.body.appendChild(provider1);

  await flushAll();
  return { provider1, provider2, provider3, app };
}

function getButtons(app: Element): Element[] {
  return qAll(app, 'button');
}

function getButtonByLabel(app: Element, label: string): Element {
  const btn = getButtons(app).find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`Button with label "${label}" not found`);
  return btn;
}

function getHeader(app: Element): Element | null {
  return q(app, 'polyx-header');
}

function getUserBadge(app: Element): Element | null {
  return q(app, 'polyx-userbadge');
}

function getSidebar(app: Element): Element | null {
  return q(app, 'polyx-sidebar');
}

function getNavItems(app: Element): Element[] {
  return qAll(app, 'polyx-navitem');
}

function getSettingsPanel(app: Element): Element | null {
  return q(app, 'polyx-settingspanel');
}

function getSettingRows(app: Element): Element[] {
  return qAll(app, 'polyx-settingrow');
}

function getBadges(app: Element): Element[] {
  return qAll(app, 'polyx-badge');
}

// ── initial render ──

describe('nested-context: initial render', () => {
  it('should show the title', async () => {
    const { app } = await mountWithProviders();
    expect(app.textContent).toContain('Nested Context');
  });

  it('should render 3 context control buttons', async () => {
    const { app } = await mountWithProviders();
    expect(getButtons(app).length).toBe(3);
  });

  it('should show Guest user by default', async () => {
    const { app } = await mountWithProviders();
    const userBtn = getButtonByLabel(app, 'User:');
    expect(userBtn.textContent).toContain('Guest');
    expect(userBtn.textContent).toContain('viewer');
  });

  it('should show light color scheme by default', async () => {
    const { app } = await mountWithProviders();
    const prefsBtn = getButtonByLabel(app, 'Prefs:');
    expect(prefsBtn.textContent).toContain('light');
  });

  it('should show read access level by default', async () => {
    const { app } = await mountWithProviders();
    const permsBtn = getButtonByLabel(app, 'Perms:');
    expect(permsBtn.textContent).toContain('read');
  });

  it('should render the Header component', async () => {
    const { app } = await mountWithProviders();
    const header = getHeader(app);
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('Welcome, Guest');
  });

  it('should render UserBadge with guest info', async () => {
    const { app } = await mountWithProviders();
    const badge = getUserBadge(app);
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('guest@example.com');
    expect(badge!.textContent).toContain('viewer');
  });

  it('should render Sidebar with 5 nav items', async () => {
    const { app } = await mountWithProviders();
    const sidebar = getSidebar(app);
    expect(sidebar).not.toBeNull();
    expect(getNavItems(app).length).toBe(5);
  });

  it('should disable Editor and Admin Panel nav items for viewer', async () => {
    const { app } = await mountWithProviders();
    const navItems = getNavItems(app);
    // Nav items: Dashboard, Documents, Editor, Admin Panel, Settings
    // With 'read' access: Editor (requires write) and Admin Panel (requires admin) should be disabled
    const editorNav = navItems[2]; // Editor
    const adminNav = navItems[3]; // Admin Panel
    expect(editorNav.className || q(editorNav, '.nav-item')?.className).toContain('disabled');
    expect(adminNav.className || q(adminNav, '.nav-item')?.className).toContain('disabled');
  });

  it('should render SettingsPanel', async () => {
    const { app } = await mountWithProviders();
    const settings = getSettingsPanel(app);
    expect(settings).not.toBeNull();
    expect(settings!.textContent).toContain('Settings');
  });

  it('should render 4 setting rows', async () => {
    const { app } = await mountWithProviders();
    expect(getSettingRows(app).length).toBe(4);
  });

  it('should show Read badges for viewer permissions', async () => {
    const { app } = await mountWithProviders();
    const badges = getBadges(app);
    // Each setting row has a Badge — with viewer perms all should say "Read"
    const badgeTexts = badges.map((b) => b.textContent?.trim());
    badgeTexts.forEach((text) => {
      expect(text).toBe('Read');
    });
  });

  it('should show default setting values', async () => {
    const { app } = await mountWithProviders();
    const settings = getSettingsPanel(app);
    expect(settings!.textContent).toContain('14'); // fontSize
    expect(settings!.textContent).toContain('light'); // colorScheme
    expect(settings!.textContent).toContain('false'); // compactMode
    expect(settings!.textContent).toContain('read'); // accessLevel
  });
});

// ── user cycling ──

describe('nested-context: user cycling', () => {
  it('should cycle Guest → Alice → Bob → Guest', async () => {
    const { app } = await mountWithProviders();
    const userBtn = getButtonByLabel(app, 'User:');

    // Guest → Alice
    await click(userBtn);
    expect(userBtn.textContent).toContain('Alice Kim');
    expect(userBtn.textContent).toContain('admin');

    // Alice → Bob
    await click(userBtn);
    expect(userBtn.textContent).toContain('Bob Park');
    expect(userBtn.textContent).toContain('editor');

    // Bob → Guest
    await click(userBtn);
    expect(userBtn.textContent).toContain('Guest');
    expect(userBtn.textContent).toContain('viewer');
  });

  it('should update Header greeting on user change', async () => {
    const { app } = await mountWithProviders();
    const userBtn = getButtonByLabel(app, 'User:');

    await click(userBtn); // → Alice
    const header = getHeader(app);
    expect(header!.textContent).toContain('Welcome, Alice Kim');
  });

  it('should update UserBadge on user change', async () => {
    const { app } = await mountWithProviders();
    const userBtn = getButtonByLabel(app, 'User:');

    await click(userBtn); // → Alice
    const badge = getUserBadge(app);
    expect(badge!.textContent).toContain('alice@polyx.dev');
    expect(badge!.textContent).toContain('admin');
  });
});

// ── permissions cycling ──

describe('nested-context: permissions cycling', () => {
  it('should cycle viewer → editor → admin → viewer', async () => {
    const { app } = await mountWithProviders();
    const permBtn = getButtonByLabel(app, 'Perms:');

    await click(permBtn); // → editor
    expect(permBtn.textContent).toContain('write');

    await click(permBtn); // → admin
    expect(permBtn.textContent).toContain('admin');

    await click(permBtn); // → viewer
    expect(permBtn.textContent).toContain('read');
  });

  it('should enable Editor nav item for editor permissions', async () => {
    const { app } = await mountWithProviders();
    const permBtn = getButtonByLabel(app, 'Perms:');
    await click(permBtn); // → editor (write)

    const navItems = getNavItems(app);
    const editorNav = navItems[2]; // Editor requires 'write'
    const editorDiv = q(editorNav, '.nav-item');
    expect(editorDiv?.className).not.toContain('disabled');
  });

  it('should show Edit badges for editor permissions', async () => {
    const { app } = await mountWithProviders();
    const permBtn = getButtonByLabel(app, 'Perms:');
    await click(permBtn); // → editor

    const badges = getBadges(app);
    const badgeTexts = badges.map((b) => b.textContent?.trim());
    badgeTexts.forEach((text) => {
      expect(text).toBe('Edit');
    });
  });

  it('should show access level in settings', async () => {
    const { app } = await mountWithProviders();
    const permBtn = getButtonByLabel(app, 'Perms:');
    await click(permBtn); // → editor

    const settings = getSettingsPanel(app);
    expect(settings!.textContent).toContain('write'); // accessLevel
  });
});

// ── preferences cycling ──

describe('nested-context: preferences cycling', () => {
  it('should cycle light → dark → compact → light', async () => {
    const { app } = await mountWithProviders();
    const prefsBtn = getButtonByLabel(app, 'Prefs:');

    await click(prefsBtn); // → dark
    expect(prefsBtn.textContent).toContain('dark');

    await click(prefsBtn); // → compact
    expect(prefsBtn.textContent).toContain('compact');

    await click(prefsBtn); // → light
    expect(prefsBtn.textContent).toContain('light');
  });

  it('should update settings values on scheme change', async () => {
    const { app } = await mountWithProviders();
    const prefsBtn = getButtonByLabel(app, 'Prefs:');

    await click(prefsBtn); // → dark
    const settings = getSettingsPanel(app);
    expect(settings!.textContent).toContain('dark'); // colorScheme = dark
    expect(settings!.textContent).toContain('14'); // fontSize stays 14

    await click(prefsBtn); // → compact
    expect(settings!.textContent).toContain('12'); // fontSize = 12
    expect(settings!.textContent).toContain('true'); // compactMode = true
  });

  it('should apply compact mode styling to nav items', async () => {
    const { app } = await mountWithProviders();
    const prefsBtn = getButtonByLabel(app, 'Prefs:');

    // light → dark → compact
    await click(prefsBtn);
    await click(prefsBtn);

    const navItems = getNavItems(app);
    const navDiv = q(navItems[0], '.nav-item') as HTMLElement;
    const style = navDiv?.getAttribute('style') || '';
    expect(style).toContain('0.7rem'); // compact font-size
  });
});

// ── multi-context interaction ──

describe('nested-context: multi-context interaction', () => {
  it('should handle user + permissions change together', async () => {
    const { app } = await mountWithProviders();
    const userBtn = getButtonByLabel(app, 'User:');
    const permBtn = getButtonByLabel(app, 'Perms:');

    await click(userBtn); // → Alice (admin)
    await click(permBtn); // → editor

    const header = getHeader(app);
    expect(header!.textContent).toContain('Welcome, Alice Kim');
    const settings = getSettingsPanel(app);
    expect(settings!.textContent).toContain('Alice Kim');
    expect(settings!.textContent).toContain('write');
  });

  it('should handle preferences + permissions change together', async () => {
    const { app } = await mountWithProviders();
    const prefsBtn = getButtonByLabel(app, 'Prefs:');
    const permBtn = getButtonByLabel(app, 'Perms:');

    await click(prefsBtn); // → dark
    await click(permBtn); // → editor

    const settings = getSettingsPanel(app);
    expect(settings!.textContent).toContain('dark');
    expect(settings!.textContent).toContain('write');

    // Badges should be Edit
    const badges = getBadges(app);
    badges.forEach((badge) => {
      expect(badge.textContent?.trim()).toBe('Edit');
    });
  });
});

// ── provider structure ──

describe('nested-context: provider structure', () => {
  it('should have correct DOM nesting: provider-1 > provider-2 > provider-3 > app', async () => {
    const { provider1, provider2, provider3, app } = await mountWithProviders();

    expect(provider1.contains(provider2)).toBe(true);
    expect(provider2.contains(provider3)).toBe(true);
    expect(provider3.contains(app)).toBe(true);
    expect(provider1.contains(app)).toBe(true);
  });

  it('should have providers with default values', async () => {
    const { provider1, provider2, provider3 } = await mountWithProviders();

    // Providers should have contextId set
    expect((provider1 as any).contextId).toBeDefined();
    expect((provider2 as any).contextId).toBeDefined();
    expect((provider3 as any).contextId).toBeDefined();

    // Values should be set (after App's useLayoutEffect runs)
    const user = (provider1 as any).value;
    expect(user.name).toBe('Guest');
    const prefs = (provider2 as any).value;
    expect(prefs.colorScheme).toBe('light');
    const perms = (provider3 as any).value;
    expect(perms.accessLevel).toBe('read');
  });
});
