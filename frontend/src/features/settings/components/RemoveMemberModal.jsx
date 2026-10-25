import React, { useState } from 'react';
import { UserMinus, X, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/Button.jsx';

export function RemoveMemberModal({
  isOpen,
  onClose,
  member,
  onRemoveSuccess,
  orgApi,
  orgId,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !member) return null;

  const isCreator = member.isCreator || false;

  const handleConfirm = async () => {
    if (isCreator) {
      setError('Cannot remove the organization creator.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await orgApi.removeMember(orgId, member.id);
      onRemoveSuccess?.(member.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--error-bg)',
                color: 'var(--error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserMinus size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                Remove Member
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Revoke access to this organization
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--error-bg)',
                border: '1px solid var(--error-border)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--error)',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={20} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to remove{' '}
              <strong style={{ color: 'var(--text)' }}>
                {member.user?.name || member.user?.email}
              </strong>{' '}
              (<code>{member.user?.email}</code>) from this organization?
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                This user will immediately lose access to all traces, logs, ingestion keys, and alert configurations for this workspace.
              </p>
            </div>
          </div>

          {isCreator && (
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: 'var(--warn-bg)',
                border: '1px solid var(--warn-border)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px',
                color: 'var(--warn)',
                fontSize: '12px',
              }}
            >
              This user is the creator of the organization and cannot be removed.
            </div>
          )}

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={isLoading || isCreator}
            >
              {isLoading ? 'Removing...' : 'Confirm Remove'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
