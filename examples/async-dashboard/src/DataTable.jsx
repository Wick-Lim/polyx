export default function DataTable({ rows = [] }) {
  return (
    <div className="data-table">
      <style>{`
        .data-table {
          width: 100%;
        }
        .table-header {
          display: flex;
          padding: 0.75rem 1.5rem;
          background: rgba(255,255,255,0.05);
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.6;
        }
        .table-header span {
          flex: 1;
        }
        .empty-msg {
          padding: 2rem;
          text-align: center;
          opacity: 0.5;
        }
      `}</style>
      <div className="table-header">
        <span>Name</span>
        <span>Email</span>
        <span>Status</span>
        <span>Score</span>
      </div>
      {rows.map(row => (
        <DataRow row={row} />
      ))}
      {rows.length === 0 ? "No matching records" : null}
    </div>
  );
}
