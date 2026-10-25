import React from 'react';
import { CheckCircle2, Building, ShieldCheck, Key, LogOut, ArrowRight, Activity, Terminal } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Card } from '../../components/Card.jsx';
import { authApi } from '../../services/authApi.js';

export function AuthSuccessView({ user, organization, onLogout, onEnterDashboard }) {
  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    onLogout?.();
  };

  return (
    <div style={{ width: '100%', maxWidth: '580px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--ok-bg)',
            border: '1px solid var(--ok-border)',
            color: 'var(--ok)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
          }}
        >
          <CheckCircle2 size={30} />
        </div>
        <h2 className="text-page-title" style={{ marginBottom: '6px' }}>
          Welcome, {user?.name || user?.email?.split('@')[0] || 'Developer'}!
        </h2>
        <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
          You are securely authenticated. Your organization workspace and telemetry pipeline are ready.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* User & Org info card */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Active Identity
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
                {user?.name || 'Personal Account'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {user?.email}
              </div>
            </div>
            <StatusBadge status="ok" label="Session Active" />
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--surface-input)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Building size={16} />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                  {organization?.name || `${user?.name || 'Personal'}'s Org`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Default Owner & Admin Group Provisioned
                </div>
              </div>
            </div>
            <StatusBadge status="accent" label="Pro Plan" size="sm" />
          </div>
        </Card>

        {/* Feature 1 Onboarding Preview */}
        <Card style={{ borderLeft: '3px solid var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Activity size={16} style={{ color: 'var(--accent)' }} />
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              Telemetry Control Plane Active
            </h4>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.4 }}>
            Eye of Agamotto receives OpenTelemetry OTLP traces directly. Explore your traces, spans, logs, and system metrics now.
          </p>

          <div
            style={{
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <span>OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>gRPC / HTTP</span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="primary"
              size="default"
              icon={ArrowRight}
              onClick={onEnterDashboard}
            >
              Open Observability Dashboard
            </Button>
            <Button
              variant="secondary"
              size="default"
              icon={Terminal}
              onClick={onEnterDashboard}
            >
              Launch Telemetry View
            </Button>
          </div>
        </Card>

        {/* Logout action */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <Button
            variant="ghost"
            size="sm"
            icon={LogOut}
            onClick={handleLogout}
          >
            Sign Out of Account
          </Button>
        </div>
      </div>
    </div>
  );
}
