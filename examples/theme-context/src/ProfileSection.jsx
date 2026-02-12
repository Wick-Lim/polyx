import { useContext } from '@polyx/runtime';
import { ThemeContext, LocaleContext } from './contexts.js';

export default function ProfileSection() {
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);

  return (
    <Card title={locale.strings.profile}>
      <div className="profile-content">
        <style>{`
          .profile-content {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
          .profile-avatar {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
          }
          .profile-name {
            font-weight: 600;
            font-size: 1.1rem;
          }
          .profile-role {
            font-size: 0.875rem;
            opacity: 0.7;
          }
        `}</style>
        <div className="profile-avatar" style={`background:${theme.primary};color:white`}>P</div>
        <span className="profile-name">PolyX User</span>
        <span className="profile-role">Developer</span>
      </div>
    </Card>
  );
}
