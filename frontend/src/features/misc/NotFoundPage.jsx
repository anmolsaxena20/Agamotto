import React from 'react';
import { EyeLogo } from '../../components/EyeLogo.jsx';
import { Button } from '../../components/Button.jsx';
import { useNavigate, useLocation } from 'react-router-dom';
import { Compass, Home, ArrowLeft, ShieldAlert } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      {/* Mystic radial aura */}
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(224, 176, 80, 0.12) 0%, rgba(229, 83, 75, 0.05) 50%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '560px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* Talisman Eye */}
        <div
          style={{
            width: '84px',
            height: '84px',
            borderRadius: '50%',
            backgroundColor: 'var(--surface)',
            border: '1px solid rgba(224, 176, 80, 0.35)',
            boxShadow: '0 0 32px rgba(224, 176, 80, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EyeLogo size={46} />
        </div>

        {/* 404 Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            404 &bull; Route Not Found
          </div>

          <h1
            className="text-page-title"
            style={{
              fontSize: '32px',
              lineHeight: '40px',
              letterSpacing: '-0.02em',
            }}
          >
            Resource or Page Not Found
          </h1>

          <p className="text-body" style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6' }}>
            The requested path at{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--warn)',
                backgroundColor: 'var(--surface-input)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: '13px',
              }}
            >
              {location.pathname}
            </code>{' '}
            does not exist on this server or has been decommissioned.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            variant="primary"
            size="lg"
            icon={Home}
            onClick={() => navigate('/dashboard')}
          >
            Return to Dashboard
          </Button>

          <Button
            variant="secondary"
            size="lg"
            icon={Compass}
            onClick={() => navigate('/')}
          >
            Go to Home
          </Button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>
          Agamotto Observability &bull; OpenTelemetry Distributed Tracing &amp; Metrics
        </div>
      </div>
    </div>
  );
}
