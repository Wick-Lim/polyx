import { useContext } from '@polyx/runtime';
import { ThemeContext, LocaleContext } from './contexts.js';

export default function InfoSection() {
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);

  return (
    <Card title={locale.strings.info}>
      <div className="info-content">
        <style>{`
          .info-content {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            font-size: 0.9rem;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 0.25rem 0;
          }
          .info-label {
            opacity: 0.6;
          }
          .info-value {
            font-weight: 500;
          }
        `}</style>
        <div className="info-row">
          <span className="info-label">{locale.strings.theme}:</span>
          <span className="info-value">{theme.mode}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{locale.strings.locale}:</span>
          <span className="info-value">{locale.lang}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Primary:</span>
          <span className="info-value" style={`color:${theme.primary}`}>{theme.primary}</span>
        </div>
      </div>
    </Card>
  );
}
