'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          height: '100dvh',
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          padding: '24px',
          gap: '16px',
        }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Eitthvað fór úrskeiðis</h2>
          <p style={{ fontSize: '0.95rem', color: '#888', margin: 0, textAlign: 'center', maxWidth: '320px' }}>
            Villa kom upp við að hlaða fréttirnar. Reyndu að endurhlaða síðuna.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '10px',
              color: '#fff',
              padding: '12px 24px',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Endurhlaða
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
