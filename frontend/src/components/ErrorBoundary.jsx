import React from 'react';
import { Card } from './Card.jsx';
import { Button } from './Button.jsx';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled view error caught by ErrorBoundary:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card style={{ padding: '28px', maxWidth: '640px', margin: '40px auto', textAlign: 'center' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: 'var(--error-bg, rgba(239, 68, 68, 0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--error)',
              margin: '0 auto 16px',
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
            Something went wrong in this view
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred. You can safely retry or navigate elsewhere.'}
          </p>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={this.resetError}>
            Reload View
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}
