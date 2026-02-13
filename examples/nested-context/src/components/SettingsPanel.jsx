import { useContext } from '@polyx/runtime';
import { UserContext, PreferencesContext, PermissionsContext } from '../contexts.js';

const SETTINGS = [
  { key: 'fontSize', label: 'Font Size', type: 'prefs' },
  { key: 'colorScheme', label: 'Color Scheme', type: 'prefs' },
  { key: 'compactMode', label: 'Compact Mode', type: 'prefs' },
  { key: 'accessLevel', label: 'Access Level', type: 'perms' },
];

export default function SettingsPanel() {
  const user = useContext(UserContext);
  const prefs = useContext(PreferencesContext);
  const perms = useContext(PermissionsContext);

  const isDark = prefs.colorScheme === 'dark';

  return (
    <div className="settings-panel" style={`background:${isDark ? '#2d2d44' : '#fff'};font-size:${prefs.fontSize}px`}>
      <style>{`
        .settings-panel {
          border-radius: 8px;
          padding: 1rem 1.25rem;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          transition: background 0.3s;
        }
        .settings-title {
          font-size: 1em;
          font-weight: 700;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid rgba(128,128,128,0.2);
        }
        .settings-user-info {
          font-size: 0.8em;
          color: #888;
          margin-bottom: 0.75rem;
        }
      `}</style>
      <div className="settings-title">Settings</div>
      <div className="settings-user-info">Logged in as {user.name} ({user.role})</div>
      {SETTINGS.map(setting => (
        <SettingRow
          key={setting.key}
          label={setting.label}
          value={setting.type === 'prefs' ? String(prefs[setting.key]) : String(perms[setting.key])}
          editable={perms.canEdit}
        />
      ))}
    </div>
  );
}
