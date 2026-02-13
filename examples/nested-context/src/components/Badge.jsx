export default function Badge({ label, color, ...rest }) {
  return (
    <span className="badge" style={`background:${color};color:#fff`} {...rest}>
      <style>{`
        .badge {
          display: inline-block;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
      `}</style>
      {label}
    </span>
  );
}
