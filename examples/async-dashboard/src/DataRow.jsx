export default function DataRow({ row = {} }) {
  const statusClass = row.status === 'active' ? 'status active' :
                      row.status === 'inactive' ? 'status inactive' : 'status pending';

  return (
    <div className="data-row">
      <style>{`
        .data-row {
          display: flex;
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid #3d3d5c;
          transition: background 0.2s;
          align-items: center;
        }
        .data-row:hover {
          background: rgba(255,255,255,0.03);
        }
        .data-row:last-child {
          border-bottom: none;
        }
        .data-row span {
          flex: 1;
          font-size: 0.9rem;
        }
        .status {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .status.active { background: rgba(46,204,113,0.2); color: #2ecc71; }
        .status.inactive { background: rgba(231,76,60,0.2); color: #e74c3c; }
        .status.pending { background: rgba(243,156,18,0.2); color: #f39c12; }
      `}</style>
      <span>{row.name}</span>
      <span>{row.email}</span>
      <span><span className={statusClass}>{row.status}</span></span>
      <span>{row.score}</span>
    </div>
  );
}
