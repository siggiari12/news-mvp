export default function Loading() {
  return (
    <div style={{background: '#000', height: '100vh', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'}}>
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
        .skeleton {
          background: #333;
          border-radius: 8px;
          animation: pulse 1.5s infinite ease-in-out;
        }
      `}</style>
      <div className="skeleton" style={{width: '100px', height: '16px', marginBottom: '16px'}}></div>
      <div className="skeleton" style={{width: '90%', height: '32px', marginBottom: '12px'}}></div>
      <div className="skeleton" style={{width: '70%', height: '32px', marginBottom: '24px'}}></div>
      <div className="skeleton" style={{width: '100%', height: '16px', marginBottom: '8px'}}></div>
      <div className="skeleton" style={{width: '100%', height: '16px', marginBottom: '8px'}}></div>
      <div className="skeleton" style={{width: '60%', height: '16px', marginBottom: '40px'}}></div>
      <div className="skeleton" style={{width: '140px', height: '40px', borderRadius: '20px'}}></div>
    </div>
  );
}
