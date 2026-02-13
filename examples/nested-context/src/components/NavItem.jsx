import { useContext } from '@polyx/runtime';
import { PermissionsContext, PreferencesContext } from '../contexts.js';

export default function NavItem({ label, icon, disabled, requiredLevel }) {
  const perms = useContext(PermissionsContext);
  const prefs = useContext(PreferencesContext);

  const isDark = prefs.colorScheme === 'dark';

  return (
    <div
      className={disabled ? 'nav-item disabled' : 'nav-item'}
      style={`font-size:${prefs.compactMode ? '0.7rem' : '0.8rem'};padding:${prefs.compactMode ? '0.3rem 0.75rem' : '0.5rem 0.75rem'};opacity:${disabled ? '0.4' : '1'}`}
    >
      <style>{`
        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: background 0.15s;
        }
        .nav-item:not(.disabled):hover {
          background: #e8f0fe;
        }
        .nav-item.disabled {
          cursor: not-allowed;
        }
        .nav-icon {
          width: 1.2em;
          text-align: center;
        }
        .nav-lock {
          margin-left: auto;
          font-size: 0.65rem;
          color: #ccc;
        }
      `}</style>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {disabled ? <span className="nav-lock">{requiredLevel}</span> : null}
    </div>
  );
}
