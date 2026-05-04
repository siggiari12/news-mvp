export default function Loading() {
  return (
    <div style={{
      background: '#000',
      height: '100dvh',
      width: '100%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.2; }
          50% { opacity: 0.4; }
          100% { opacity: 0.2; }
        }
        .skeleton {
          background: rgba(255,255,255,0.1);
          animation: pulse 1.2s infinite ease-in-out;
        }
      `}</style>

      {/* Header skeleton */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50
      }}>
        <div className="skeleton" style={{width: '80px', height: '28px', borderRadius: '6px'}} />
        <div style={{display: 'flex', gap: '12px'}}>
          <div className="skeleton" style={{width: '32px', height: '32px', borderRadius: '50%'}} />
          <div className="skeleton" style={{width: '32px', height: '32px', borderRadius: '50%'}} />
        </div>
      </div>

      {/* Category filter skeleton */}
      <div style={{
        position: 'absolute',
        top: '64px',
        left: 0,
        right: 0,
        padding: '12px 20px',
        display: 'flex',
        gap: '8px',
        zIndex: 40
      }}>
        {[60, 72, 64, 56, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{
            width: `${w}px`,
            height: '32px',
            borderRadius: '16px',
            flexShrink: 0
          }} />
        ))}
      </div>

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '70%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)',
        pointerEvents: 'none'
      }} />

      {/* Card content skeleton */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '24px',
        paddingBottom: '140px'
      }}>
        <div className="skeleton" style={{width: '120px', height: '20px', borderRadius: '4px', marginBottom: '12px'}} />
        <div className="skeleton" style={{width: '100%', height: '28px', borderRadius: '6px', marginBottom: '8px'}} />
        <div className="skeleton" style={{width: '85%', height: '28px', borderRadius: '6px', marginBottom: '16px'}} />
        <div className="skeleton" style={{width: '100%', height: '16px', borderRadius: '4px', marginBottom: '6px'}} />
        <div className="skeleton" style={{width: '90%', height: '16px', borderRadius: '4px', marginBottom: '6px'}} />
        <div className="skeleton" style={{width: '70%', height: '16px', borderRadius: '4px'}} />
      </div>

      {/* "Lesa meira" skeleton */}
      <div style={{
        position: 'absolute',
        bottom: '100px',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div className="skeleton" style={{width: '32px', height: '32px', borderRadius: '50%', marginBottom: '8px'}} />
        <div className="skeleton" style={{width: '80px', height: '12px', borderRadius: '4px'}} />
      </div>
    </div>
  );
}
