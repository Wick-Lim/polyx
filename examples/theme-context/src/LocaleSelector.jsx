export default function LocaleSelector({ current, onChange }) {
  return (
    <div className="locale-selector">
      <style>{`
        .locale-selector {
          display: flex;
          gap: 0.25rem;
        }
        .locale-btn {
          padding: 0.4rem 0.75rem;
          border: 1px solid #ccc;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.2s;
        }
        .locale-btn:hover {
          background: #eee;
        }
        .locale-btn.active {
          background: #4a90d9;
          color: white;
          border-color: #4a90d9;
        }
      `}</style>
      <button
        className={current === 'en' ? 'locale-btn active' : 'locale-btn'}
        onClick={() => onChange('en')}
      >EN</button>
      <button
        className={current === 'ko' ? 'locale-btn active' : 'locale-btn'}
        onClick={() => onChange('ko')}
      >KO</button>
      <button
        className={current === 'ja' ? 'locale-btn active' : 'locale-btn'}
        onClick={() => onChange('ja')}
      >JA</button>
    </div>
  );
}
