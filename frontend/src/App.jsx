import React, { useState, useEffect } from 'react';
import './styles/tokens.css';
import { AuthPage } from './features/auth/AuthPage.jsx';
import { ObservabilityApp } from './features/observability/ObservabilityApp.jsx';

const DEFAULT_DEMO_USER = {
  id: 'usr-agamotto-master',
  name: 'Doctor Strange (Demo)',
  email: 'sorcerer.supreme@agamotto.dev',
};

const DEFAULT_DEMO_ORG = {
  id: 'org-kamar-taj',
  name: "Doctor Strange's Org",
  slug: 'kamar-taj',
};

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('eoa_user');
      return saved ? JSON.parse(saved) : DEFAULT_DEMO_USER;
    } catch {
      return DEFAULT_DEMO_USER;
    }
  });

  const [organization, setOrganization] = useState(() => {
    try {
      const saved = localStorage.getItem('eoa_org');
      return saved ? JSON.parse(saved) : DEFAULT_DEMO_ORG;
    } catch {
      return DEFAULT_DEMO_ORG;
    }
  });

  // Default to observability dashboard for instant telemetry exploration
  const [currentScreen, setCurrentScreen] = useState('observability'); // 'observability' | 'auth'

  useEffect(() => {
    if (user) {
      localStorage.setItem('eoa_user', JSON.stringify(user));
    }
    if (organization) {
      localStorage.setItem('eoa_org', JSON.stringify(organization));
    }
  }, [user, organization]);

  const handleLoginSuccess = (data) => {
    if (data?.user) {
      setUser(data.user);
    }
    if (data?.organization) {
      setOrganization(data.organization);
    }
    setCurrentScreen('observability');
  };

  const handleSignOut = () => {
    setCurrentScreen('auth');
  };

  if (currentScreen === 'auth') {
    return (
      <AuthPage
        initialUser={user ? { user, organization } : null}
        onEnterDashboard={(data) => {
          if (data?.user) setUser(data.user);
          if (data?.organization) setOrganization(data.organization);
          setCurrentScreen('observability');
        }}
      />
    );
  }

  return (
    <ObservabilityApp
      user={user}
      organization={organization}
      onSignOut={handleSignOut}
    />
  );
}
