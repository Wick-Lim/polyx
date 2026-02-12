import { useContext } from '@polyx/runtime';
import { ThemeContext, LocaleContext } from './contexts.js';

export default function Toolbar({ onToggleTheme, onLocaleChange, currentLocale }) {
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);

  return (
    <div className="toolbar" style={`background:${theme.surface};border-bottom:2px solid ${theme.primary}`}>
      <style>{`
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-radius: 12px;
          margin-bottom: 1rem;
        }
        .toolbar-title {
          font-size: 1.5rem;
          font-weight: 700;
        }
        .toolbar-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }
      `}</style>
      <span className="toolbar-title">{locale.strings.greeting}!</span>
      <div className="toolbar-actions">
        <ThemeToggle onToggle={onToggleTheme} />
        <LocaleSelector current={currentLocale} onChange={onLocaleChange} />
      </div>
    </div>
  );
}
