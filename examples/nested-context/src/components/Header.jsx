import { useContext } from '@polyx/runtime';
import { UserContext, PreferencesContext } from '../contexts.js';

export default function Header() {
  const user = useContext(UserContext);
  const prefs = useContext(PreferencesContext);

  const isDark = prefs.colorScheme === 'dark';

  return (
    <div className="header" style={`background:${isDark ? '#2d2d44' : '#fff'};font-size:${prefs.fontSize}px`}>
      <style>{`
        .header {
          padding: 1rem 1.25rem;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background 0.3s;
        }
        .header-greeting {
          font-size: 1.1em;
          font-weight: 600;
        }
      `}</style>
      <span className="header-greeting">Welcome, {user.name}</span>
      <UserBadge />
    </div>
  );
}
