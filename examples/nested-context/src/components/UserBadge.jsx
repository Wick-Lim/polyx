import { useContext } from '@polyx/runtime';
import { UserContext } from '../contexts.js';

export default function UserBadge() {
  const user = useContext(UserContext);

  const roleColor = user.role === 'admin' ? '#e74c3c' : user.role === 'editor' ? '#f39c12' : '#95a5a6';

  return (
    <span className="user-badge" style={`border-color:${roleColor}`}>
      <style>{`
        .user-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.6rem;
          border: 2px solid;
          border-radius: 20px;
          font-size: 0.75rem;
        }
        .badge-email {
          color: #888;
        }
        .badge-role {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.65rem;
        }
      `}</style>
      <span className="badge-email">{user.email}</span>
      <span className="badge-role" style={`color:${roleColor}`}>{user.role}</span>
    </span>
  );
}
