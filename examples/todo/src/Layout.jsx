export default function Layout({ children }) {
  return (
    <div className="layout">
      <style>{`
        :host { display: block; }
        .layout {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.1);
          padding: 2rem;
        }
      `}</style>
      {children}
    </div>
  );
}
