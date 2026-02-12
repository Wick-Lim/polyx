import { useContext } from '@polyx/runtime';
import { ThemeContext } from './contexts.js';

export default function Card({ title, children }) {
  const theme = useContext(ThemeContext);

  return (
    <div className="card" style={`background:${theme.surface};color:${theme.text}`}>
      <style>{`
        .card {
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          transition: background 0.3s, color 0.3s;
        }
        .card-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid rgba(128,128,128,0.2);
        }
      `}</style>
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}
