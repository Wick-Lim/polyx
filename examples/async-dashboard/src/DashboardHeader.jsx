export default function DashboardHeader() {
  return (
    <div className="dashboard-header">
      <style>{`
        .dashboard-header {
          background: linear-gradient(135deg, #4a90d9, #764ba2);
          padding: 2rem;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        .dashboard-header h1 {
          font-size: 1.8rem;
          font-weight: 700;
          color: white;
          margin-bottom: 0.5rem;
        }
        .dashboard-header p {
          color: rgba(255,255,255,0.8);
          font-size: 0.95rem;
        }
      `}</style>
      <h1>Async Dashboard</h1>
      <p>PolyX: useEffect, useRef, useLayoutEffect, Error Boundaries</p>
    </div>
  );
}
