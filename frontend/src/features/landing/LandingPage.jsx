import React from 'react';
import { EyeLogo } from '../../components/EyeLogo.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Sparkles,
  ArrowRight,
  Activity,
  Layers,
  Shield,
  Zap,
  Server,
  Terminal,
  Clock,
  GitBranch,
  Network,
  Share2,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Background Mystic Ambient Glows */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '900px',
          height: '500px',
          background: 'radial-gradient(ellipse at top, rgba(224, 176, 80, 0.15) 0%, rgba(13, 16, 23, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Navigation Header */}
      <header
        style={{
          height: '70px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'rgba(21, 26, 35, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <EyeLogo size={32} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: '16px',
                letterSpacing: '0.04em',
                color: 'var(--text)',
              }}
            >
              EYE OF AGAMOTTO
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--accent)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Telemetry &amp; Intelligence
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a
            href="#features"
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
          >
            Capabilities
          </a>
          <a
            href="#architecture"
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
          >
            Architecture
          </a>
          <a
            href="#telemetry"
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
          >
            ClickHouse Engine
          </a>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated ? (
            <Button
              variant="primary"
              size="sm"
              icon={ArrowRight}
              onClick={() => navigate('/dashboard')}
            >
              Open Observability Console
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/login')}
              >
                Sign In
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/signup')}
              >
                Get Started
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '80px 24px 60px',
          maxWidth: '1120px',
          margin: '0 auto',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid rgba(224, 176, 80, 0.35)',
            borderRadius: 'var(--radius-full)',
            color: 'var(--accent)',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          <Sparkles size={14} />
          <span>OpenTelemetry Native &bull; Sub-Millisecond Columnar Analytics</span>
        </div>

        <h1
          style={{
            fontSize: '52px',
            lineHeight: '1.15',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            maxWidth: '920px',
            color: 'var(--text)',
          }}
        >
          Enterprise Observability for Modern Distributed Microservices
        </h1>

        <p
          style={{
            fontSize: '18px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            maxWidth: '720px',
          }}
        >
          Pinpoint production bottlenecks and anomalous latency in seconds. Combining OTLP streaming, ClickHouse columnar compression, and interactive waterfall Gantt corridors into one unified observability platform.
        </p>

        <div style={{ display: 'flex', gap: '14px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            variant="primary"
            size="lg"
            icon={ArrowRight}
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/signup')}
          >
            {isAuthenticated ? 'Open Platform Console' : 'Start Telemetry Pipeline'}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            icon={Terminal}
            onClick={() => navigate('/login')}
          >
            Sign In with Existing Account
          </Button>
        </div>

        {/* Live Metrics Showcase Banner */}
        <div
          style={{
            marginTop: '48px',
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            padding: '24px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Spans Ingested
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              4.8M+
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ok)', marginTop: '2px' }}>Real-time batch ingestion</div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Median Query Time
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              &lt; 14.2ms
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ok)', marginTop: '2px' }}>ClickHouse quantileTDigest</div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Fleet Corridors
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ok)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              100% Live
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Zero feedback loop amplification</div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Security Architecture
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              Strict RBAC
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>HttpOnly cookies &amp; multi-tab sync</div>
          </div>
        </div>
      </section>

      {/* Feature Capabilities Grid */}
      <section
        id="features"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '60px 24px',
          maxWidth: '1120px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 className="text-page-title" style={{ fontSize: '32px' }}>Built for Critical Microservice Pipelines</h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
            Comprehensive observability without telemetry overhead or storage exhaustion.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div
            style={{
              padding: '24px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius)', backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GitBranch size={20} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Interactive Trace Corridors
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Drill down from high-level microservice latencies into deep parent-child Gantt waterfall timelines, pinpointing the exact offending function call or SQL execution.
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius)', backgroundColor: 'var(--ok-bg)', color: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Share2 size={20} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Topology Dependency Graph
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Real-time service-to-service call mapping with edge RPS, p99 latency meters, and degradation indicators across upstream and downstream consumers.
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius)', backgroundColor: 'rgba(229, 166, 61, 0.15)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Granular Multi-Tenant RBAC
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Organization workspace tenancy with ingest API keys, configurable permission groups, and instant cross-tab synchronized session revocation.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture & Engine Section */}
      <section
        id="architecture"
        style={{
          padding: '60px 24px',
          backgroundColor: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ maxWidth: '1120px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '40px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Engine Specification
            </div>
            <h2 className="text-page-title" style={{ fontSize: '28px', marginBottom: '16px' }}>
              Engineered Against Telemetry Feedback Loops
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '16px' }}>
              Agamotto isolates ingestion pipelines from observability sinks using buffered memory queues and strict OpenTelemetry SpanKind scoping, preventing catastrophic ClickHouse <code>TOO_MANY_PARTS</code> partition errors.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                <span>Columnar ZSTD dictionary compression across spans, metrics &amp; logs</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                <span>TDigest percentile quantile distribution with sub-millisecond execution</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                <span>Automatic 401 token refresh queue &amp; BroadcastChannel multi-tab sync</span>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '20px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
              // Agamotto Ingest Gateway Architecture
            </div>
            <div><span style={{ color: 'var(--accent)' }}>const</span> gateway = <span style={{ color: 'var(--ok)' }}>createIngestionPipeline</span>&#123;</div>
            <div style={{ paddingLeft: '16px' }}>partitionKey: <span style={{ color: 'var(--warn)' }}>"org_id"</span>,</div>
            <div style={{ paddingLeft: '16px' }}>compression: <span style={{ color: 'var(--warn)' }}>"ZSTD(3)"</span>,</div>
            <div style={{ paddingLeft: '16px' }}>storageEngine: <span style={{ color: 'var(--warn)' }}>"ClickHouse.trace_spans"</span>,</div>
            <div style={{ paddingLeft: '16px' }}>latencyStrategy: <span style={{ color: 'var(--accent)' }}>"quantileTDigest"</span>,</div>
            <div style={{ paddingLeft: '16px' }}>multiTabSync: <span style={{ color: 'var(--ok)' }}>true</span>,</div>
            <div>&#125;;</div>
          </div>
        </div>
      </section>

      {/* Call to Action Footer */}
      <footer
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <EyeLogo size={24} />
          <span style={{ fontWeight: 700, fontSize: '15px' }}>EYE OF AGAMOTTO</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          High-performance distributed telemetry &bull; OpenTelemetry 1.0 Native &bull; ClickHouse Analytical Store
        </p>
        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          &copy; {new Date().getFullYear()} Eye of Agamotto. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
