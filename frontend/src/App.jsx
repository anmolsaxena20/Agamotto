import React, { useState } from 'react';
import './styles/tokens.css';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { OrgProvider } from './context/OrgContext.jsx';

// Pages
import { LandingPage } from './features/landing/LandingPage.jsx';
import { AuthPage } from './features/auth/AuthPage.jsx';
import { OAuthCallbackPage } from './features/auth/OAuthCallbackPage.jsx';
import { NotFoundPage } from './features/misc/NotFoundPage.jsx';

// Layout & Components
import { AppHeader } from './components/AppHeader.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// Telemetry Views
import { TelemetryOverviewView } from './features/telemetry/TelemetryOverviewView.jsx';
import { ServicesView } from './features/telemetry/ServicesView.jsx';
import { LatencyView } from './features/telemetry/LatencyView.jsx';
import { ThroughputView } from './features/telemetry/ThroughputView.jsx';
import { EndpointsView } from './features/telemetry/EndpointsView.jsx';
import { DependencyGraphView } from './features/telemetry/DependencyGraphView.jsx';
import { TracesView } from './features/telemetry/TracesView.jsx';
import { LogsView } from './features/telemetry/LogsView.jsx';
import { ResourcesView } from './features/telemetry/ResourcesView.jsx';
import { AiAnomaliesView } from './features/telemetry/AiAnomaliesView.jsx';

// AI Intelligence Components
import { AiChatDrawer, FloatingAiTrigger } from './components/AiChatDrawer.jsx';

// Organization & RBAC Views
import { OrganizationsView } from './features/org/OrganizationsView.jsx';
import { MembersView } from './features/org/MembersView.jsx';
import { KeysView } from './features/org/KeysView.jsx';

/**
 * Protected Dashboard Shell with Sidebar and Subviews
 */
function DashboardShell() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { tab = 'overview' } = useParams();

  // Deep scoping trace/service cross-navigation state
  const [scopedTraceId, setScopedTraceId] = useState(null);
  const [scopedService, setScopedService] = useState(null);

  // AI Assistant Chat Drawer state
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatInitialPrompt, setAiChatInitialPrompt] = useState('');

  const openAiChat = (prompt = '') => {
    setAiChatInitialPrompt(prompt);
    setIsAiChatOpen(true);
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            border: '3px solid var(--accent-subtle)',
            borderTopColor: 'var(--accent)',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', letterSpacing: '0.04em' }}>
          Loading Telemetry Console...
        </div>
      </div>
    );
  }

  // Protected route enforcement
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const VALID_DASHBOARD_TABS = [
    'anomalies',
    'overview',
    'services',
    'latency',
    'throughput',
    'endpoints',
    'graph',
    'traces',
    'logs',
    'resources',
    'organizations',
    'members',
    'keys',
  ];

  // If garbage sub-path was entered in dashboard URL (e.g. /dashboard/overvie), render 404
  if (!VALID_DASHBOARD_TABS.includes(tab)) {
    return <NotFoundPage />;
  }

  const navigateToTrace = (traceId) => {
    setScopedTraceId(traceId);
    navigate('/dashboard/traces');
  };

  const navigateToService = (serviceName) => {
    setScopedService(serviceName);
    navigate('/dashboard/services');
  };

  return (
    <div
      style={{
        height: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Application Header */}
      <AppHeader
        onNavigate={(targetTab) => navigate(`/dashboard/${targetTab}`)}
        onOpenAiChat={openAiChat}
      />

      {/* Main Layout Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={tab}
          onSelectTab={(targetTab) => navigate(`/dashboard/${targetTab}`)}
        />

        {/* Dynamic Route Content Scroll Container */}
        <main
          style={{
            flex: 1,
            padding: '28px 36px',
            overflowY: 'auto',
            overflowX: 'hidden',
            height: 'calc(100vh - 60px)',
          }}
        >
          <ErrorBoundary key={tab}>
            {tab === 'anomalies' && (
              <AiAnomaliesView
                onSelectTrace={navigateToTrace}
                onSelectService={navigateToService}
                onOpenAiChat={openAiChat}
              />
            )}

            {tab === 'overview' && (
              <TelemetryOverviewView
                onSelectService={navigateToService}
                onSelectTrace={navigateToTrace}
                onNavigate={(targetTab) => navigate(`/dashboard/${targetTab}`)}
              />
            )}

            {tab === 'services' && (
              <ServicesView
                initialService={scopedService}
                onSelectTrace={navigateToTrace}
              />
            )}

            {tab === 'latency' && <LatencyView />}

            {tab === 'throughput' && <ThroughputView />}

            {tab === 'endpoints' && (
              <EndpointsView onSelectEndpoint={() => navigate('/dashboard/traces')} />
            )}

            {tab === 'graph' && (
              <DependencyGraphView onSelectService={navigateToService} />
            )}

            {tab === 'traces' && (
              <TracesView
                initialTraceId={scopedTraceId}
                onOpenAiChat={openAiChat}
              />
            )}

            {tab === 'logs' && (
              <LogsView
                onSelectTrace={navigateToTrace}
                onSelectService={navigateToService}
              />
            )}

            {tab === 'resources' && (
              <ResourcesView
                onSelectService={navigateToService}
                onSelectTrace={navigateToTrace}
                onNavigate={(targetTab) => navigate(`/dashboard/${targetTab}`)}
              />
            )}

            {tab === 'organizations' && <OrganizationsView />}

            {tab === 'members' && <MembersView />}

            {tab === 'keys' && <KeysView />}
          </ErrorBoundary>
        </main>
      </div>

      {/* Floating AI Agent Trigger (Talisman Launcher) */}
      <FloatingAiTrigger onClick={() => openAiChat()} />

      {/* Slide-over AI Assistant Chat Drawer */}
      <AiChatDrawer
        isOpen={isAiChatOpen}
        onClose={() => {
          setIsAiChatOpen(false);
          setAiChatInitialPrompt('');
        }}
        initialPrompt={aiChatInitialPrompt}
        onSelectTrace={navigateToTrace}
        onSelectService={navigateToService}
        onSelectEndpoint={() => navigate('/dashboard/endpoints')}
      />
    </div>
  );
}

/**
 * Main App Router Component
 */
export default function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <BrowserRouter>
          <Routes>
            {/* 1. Dedicated Landing Page at root / */}
            <Route path="/" element={<LandingPage />} />

            {/* 2. Authentication routes */}
            <Route
              path="/login"
              element={<AuthRouteWrapper initialMode="login" />}
            />
            <Route
              path="/signup"
              element={<AuthRouteWrapper initialMode="signup" />}
            />

            {/* 3. OAuth Callback Route */}
            <Route path="/auth/callback" element={<OAuthCallbackPage />} />

            {/* 4. Protected Dashboard Routes */}
            <Route path="/dashboard" element={<Navigate to="/dashboard/overview" replace />} />
            <Route path="/dashboard/:tab" element={<DashboardShell />} />

            {/* 4. Custom 404 Page for any unrecognized URL */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </OrgProvider>
    </AuthProvider>
  );
}

// Helper wrapper to redirect logged-in users away from /login or /signup
function AuthRouteWrapper({ initialMode }) {
  const { isAuthenticated, isLoading, setUser } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated) {
    return <Navigate to="/dashboard/overview" replace />;
  }

  return (
    <AuthPage
      initialMode={initialMode}
      onAuthSuccess={(newUser) => setUser(newUser)}
    />
  );
}
