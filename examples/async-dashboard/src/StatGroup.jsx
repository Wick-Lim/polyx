export default function StatGroup({ stats = {} }) {
  return (
    <>
      <StatCard label="Total" value={stats.total} color="#4a90d9" />
      <StatCard label="Active" value={stats.active} color="#2ecc71" />
      <StatCard label="Inactive" value={stats.inactive} color="#e74c3c" />
      <StatCard label="Pending" value={stats.pending} color="#f39c12" />
      <StatCard label="Avg Score" value={stats.avgScore} color="#9b59b6" />
    </>
  );
}
