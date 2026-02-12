import { useState, useEffect, useMemo } from '@polyx/runtime';

function generateMockData() {
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank'];
  const statuses = ['active', 'inactive', 'pending'];
  return names.map((name, i) => ({
    id: i + 1,
    name,
    email: `${name.toLowerCase()}@example.com`,
    status: statuses[i % 3],
    score: Math.floor(Math.random() * 100),
  }));
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      try {
        const result = generateMockData();
        setData(result);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (!filterText) return data;
    const lower = filterText.toLowerCase();
    return data.filter(row =>
      row.name.toLowerCase().includes(lower) ||
      row.email.toLowerCase().includes(lower) ||
      row.status.includes(lower)
    );
  }, [data, filterText]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0, inactive: 0, pending: 0, avgScore: 0 };
    return {
      total: data.length,
      active: data.filter(d => d.status === 'active').length,
      inactive: data.filter(d => d.status === 'inactive').length,
      pending: data.filter(d => d.status === 'pending').length,
      avgScore: Math.round(data.reduce((sum, d) => sum + d.score, 0) / data.length),
    };
  }, [data]);

  return (
    <div className="dashboard">
      <style>{`
        .dashboard {
          max-width: 1000px;
          margin: 0 auto;
          padding: 2rem;
        }
        .loading-text {
          text-align: center;
          padding: 3rem;
          font-size: 1.2rem;
          color: #64b5f6;
        }
        .error-text {
          text-align: center;
          padding: 3rem;
          color: #ff6b6b;
        }
      `}</style>
      <DashboardHeader />
      {loading ? "Loading data..." : null}
      {error ? "Error loading data" : null}
      {!loading && !error ? <StatGroup stats={stats} /> : null}
      {!loading && !error ? <FilterInput value={filterText} onInput={setFilterText} /> : null}
      {!loading && !error ? <Panel title={`Users (${filteredData.length})`}>
        <DataTable rows={filteredData} />
      </Panel> : null}
      {!loading && !error ? <DimensionDisplay /> : null}
    </div>
  );
}
