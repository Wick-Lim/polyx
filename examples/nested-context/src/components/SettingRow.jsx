import { useContext } from '@polyx/runtime';
import { PreferencesContext, PermissionsContext } from '../contexts.js';

export default function SettingRow({ label, value, editable }) {
  const prefs = useContext(PreferencesContext);
  const perms = useContext(PermissionsContext);

  const isDark = prefs.colorScheme === 'dark';
  const badgeType = editable ? 'editable' : 'readonly';
  const badgeLabel = editable ? 'Edit' : 'Read';
  const badgeColor = editable ? '#4caf50' : '#95a5a6';

  return (
    <div
      className="setting-row"
      style={`padding:${prefs.compactMode ? '0.3rem 0' : '0.5rem 0'};border-bottom:1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`}
    >
      <style>{`
        .setting-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.9em;
        }
        .setting-label {
          flex: 1;
          font-weight: 500;
        }
        .setting-value {
          color: #888;
          font-size: 0.85em;
        }
      `}</style>
      <span className="setting-label">{label}</span>
      <span className="setting-value">{value}</span>
      <Badge label={badgeLabel} color={badgeColor} title={perms.accessLevel} />
    </div>
  );
}
