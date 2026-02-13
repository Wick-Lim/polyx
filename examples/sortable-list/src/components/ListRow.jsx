export default function ListRow({ id, name, score, status, category, selected, onSelect }) {
  return (
    <div
      className={selected ? 'list-row selected' : 'list-row'}
      style={`background:${selected ? '#e8f0fe' : 'transparent'}`}
      onClick={() => onSelect(id)}
    >
      <style>{`
        .list-row {
          display: grid;
          grid-template-columns: 3rem 1fr 4.5rem 5rem 6rem;
          gap: 0.5rem;
          padding: 0.4rem 0.75rem;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.8rem;
          cursor: pointer;
          transition: background 0.1s;
          align-items: center;
        }
        .list-row:hover {
          background: #f5f8ff !important;
        }
        .list-row.selected {
          font-weight: 600;
        }
        .row-rank {
          color: #999;
          font-size: 0.7rem;
        }
        .row-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .score-bar {
          height: 4px;
          border-radius: 2px;
          background: #e0e0e0;
          overflow: hidden;
        }
        .score-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.2s;
        }
        .row-status {
          font-size: 0.7rem;
        }
        .row-category {
          font-size: 0.7rem;
          color: #666;
        }
      `}</style>
      <span className="row-rank">{id}</span>
      <span className="row-name">{name}</span>
      <span>
        {score}
        <div className="score-bar">
          <div className="score-fill" style={`width:${score}%;background:${score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336'}`}></div>
        </div>
      </span>
      <span className="row-status">{status}</span>
      <span className="row-category">{category}</span>
    </div>
  );
}
