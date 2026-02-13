export default function ListStats({ total, selectedId }) {
  return (
    <div className="list-stats">
      <style>{`
        .list-stats {
          display: flex;
          gap: 1.5rem;
          padding: 0.5rem 0.75rem;
          background: #fff;
          border-radius: 6px;
          margin-bottom: 0.75rem;
          font-size: 0.8rem;
          color: #666;
        }
        .stat-label {
          font-weight: 600;
          color: #333;
        }
      `}</style>
      <span><span className="stat-label">Total:</span> {total}</span>
      <span><span className="stat-label">Selected:</span> {selectedId !== null ? '#' + selectedId : 'None'}</span>
    </div>
  );
}
