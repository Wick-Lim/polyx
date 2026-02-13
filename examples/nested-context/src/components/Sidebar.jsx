import { useContext } from '@polyx/runtime';
import { PermissionsContext } from '../contexts.js';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: '\u25A0', requiredLevel: 'read' },
  { label: 'Documents', icon: '\u25B6', requiredLevel: 'read' },
  { label: 'Editor', icon: '\u270E', requiredLevel: 'write' },
  { label: 'Admin Panel', icon: '\u2699', requiredLevel: 'admin' },
  { label: 'Settings', icon: '\u2630', requiredLevel: 'read' },
];

const LEVEL_ORDER = { read: 0, write: 1, admin: 2 };

export default function Sidebar() {
  const perms = useContext(PermissionsContext);
  const currentLevel = LEVEL_ORDER[perms.accessLevel] || 0;

  return (
    <nav className="sidebar">
      <style>{`
        .sidebar {
          background: #fff;
          border-radius: 8px;
          padding: 0.75rem 0;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          min-height: 300px;
        }
        .sidebar-title {
          padding: 0 0.75rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #999;
          border-bottom: 1px solid #f0f0f0;
          margin-bottom: 0.25rem;
        }
      `}</style>
      <div className="sidebar-title">Navigation</div>
      {NAV_ITEMS.map(item => (
        <NavItem
          key={item.label}
          label={item.label}
          icon={item.icon}
          disabled={LEVEL_ORDER[item.requiredLevel] > currentLevel}
          requiredLevel={item.requiredLevel}
        />
      ))}
    </nav>
  );
}
