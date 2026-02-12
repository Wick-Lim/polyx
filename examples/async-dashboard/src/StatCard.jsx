export default function StatCard({ label = '', value = 0, color = '#4a90d9' }) {
  return (
    <div className="stat-card">
      <style>{`
        :host {
          display: inline-block;
        }
        .stat-card {
          background: #2d2d44;
          border-radius: 10px;
          padding: 1.25rem;
          text-align: center;
          min-width: 120px;
          display: inline-block;
          margin: 0.25rem;
          transition: transform 0.2s;
        }
        .stat-card:hover {
          transform: translateY(-2px);
        }
        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
        }
        .stat-label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.7;
        }
      `}</style>
      <div className="stat-value" style={`color:${color}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
