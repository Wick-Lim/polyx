import { useState, useCallback, useLayoutEffect } from '@polyx/runtime';

const USERS = {
  guest: { name: 'Guest', email: 'guest@example.com', role: 'viewer' },
  alice: { name: 'Alice Kim', email: 'alice@polyx.dev', role: 'admin' },
  bob: { name: 'Bob Park', email: 'bob@polyx.dev', role: 'editor' },
};

const SCHEMES = {
  light: { fontSize: 14, colorScheme: 'light', compactMode: false },
  dark: { fontSize: 14, colorScheme: 'dark', compactMode: false },
  compact: { fontSize: 12, colorScheme: 'light', compactMode: true },
};

const PERMS = {
  viewer: { canEdit: false, canDelete: false, accessLevel: 'read' },
  editor: { canEdit: true, canDelete: false, accessLevel: 'write' },
  admin: { canEdit: true, canDelete: true, accessLevel: 'admin' },
};

export default function App() {
  const [userKey, setUserKey] = useState('guest');
  const [schemeKey, setSchemeKey] = useState('light');
  const [permKey, setPermKey] = useState('viewer');

  const cycleUser = useCallback(() => {
    setUserKey(prev => {
      const keys = Object.keys(USERS);
      return keys[(keys.indexOf(prev) + 1) % keys.length];
    });
  }, []);

  const cycleScheme = useCallback(() => {
    setSchemeKey(prev => {
      const keys = Object.keys(SCHEMES);
      return keys[(keys.indexOf(prev) + 1) % keys.length];
    });
  }, []);

  const cyclePerm = useCallback(() => {
    setPermKey(prev => {
      const keys = Object.keys(PERMS);
      return keys[(keys.indexOf(prev) + 1) % keys.length];
    });
  }, []);

  const user = USERS[userKey] || USERS.guest;
  const prefs = SCHEMES[schemeKey] || SCHEMES.light;
  const perms = PERMS[permKey] || PERMS.viewer;

  useLayoutEffect(() => {
    const el = document.querySelector('polyx-ctx-provider-1');
    if (el) el.value = user;
  }, [user]);

  useLayoutEffect(() => {
    const el = document.querySelector('polyx-ctx-provider-2');
    if (el) el.value = prefs;
  }, [prefs]);

  useLayoutEffect(() => {
    const el = document.querySelector('polyx-ctx-provider-3');
    if (el) el.value = perms;
  }, [perms]);

  useLayoutEffect(() => {
    const isDark = prefs.colorScheme === 'dark';
    document.body.style.background = isDark ? '#1a1a2e' : '#f0f2f5';
    document.body.style.color = isDark ? '#e0e0e0' : '#333';
  }, [prefs]);

  return (
    <div className="app-container">
      <style>{`
        .app-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 1.5rem;
        }
        .app-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }
        .context-controls {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 1.5rem;
        }
        .ctx-btn {
          padding: 0.4rem 0.8rem;
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
          font-size: 0.8rem;
          transition: background 0.15s;
        }
        .ctx-btn:hover {
          background: #e8f0fe;
        }
        .ctx-label {
          font-weight: 700;
          margin-right: 0.25rem;
        }
        .app-layout {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 1rem;
        }
        .app-main {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
      `}</style>
      <h1 className="app-title">Nested Context (3 providers, 9 components)</h1>
      <div className="context-controls">
        <button className="ctx-btn" onClick={cycleUser}>
          <span className="ctx-label">User:</span> {user.name} ({user.role})
        </button>
        <button className="ctx-btn" onClick={cycleScheme}>
          <span className="ctx-label">Prefs:</span> {prefs.colorScheme} {prefs.compactMode ? '(compact)' : ''}
        </button>
        <button className="ctx-btn" onClick={cyclePerm}>
          <span className="ctx-label">Perms:</span> {perms.accessLevel}
        </button>
      </div>
      <div className="app-layout">
        <Sidebar />
        <div className="app-main">
          <Header />
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}
