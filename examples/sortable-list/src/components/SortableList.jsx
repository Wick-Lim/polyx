export default function SortableList({ items = [], selectedId, onSelect }) {
  return (
    <div className="sortable-list">
      <style>{`
        .sortable-list {
          background: #fff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }
        .list-header {
          display: grid;
          grid-template-columns: 3rem 1fr 4.5rem 5rem 6rem;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: #f8f9fa;
          border-bottom: 2px solid #e0e0e0;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #888;
        }
      `}</style>
      <div className="list-header">
        <span>#</span>
        <span>Name</span>
        <span>Score</span>
        <span>Status</span>
        <span>Category</span>
      </div>
      {items.map(item => (
        <ListRow
          key={item.id}
          id={item.id}
          name={item.name}
          score={item.score}
          status={item.status}
          category={item.category}
          selected={item.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
