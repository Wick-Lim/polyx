export default function Panel({ title, children }) {
  return (
    <div className="panel">
      <style>{`
        .panel {
          background: #2d2d44;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }
        .panel-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #3d3d5c;
          font-weight: 600;
          font-size: 1rem;
        }
        .panel-body {
          padding: 0;
        }
      `}</style>
      <div className="panel-header">{title}</div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
