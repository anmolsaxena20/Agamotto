import React, { useState } from 'react';
import { Mail, UserPlus, X, Shield, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../../../components/Button.jsx';
import { Input } from '../../../components/Input.jsx';

export function InviteMemberModal({
  isOpen,
  onClose,
  groups = [],
  onInviteSuccess,
  orgApi,
  orgId,
}) {
  const [email, setEmail] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Default to VIEWER if available, otherwise first group
  const defaultGroup = groups.find((g) => g.code === 'VIEWER') || groups[0];
  const activeGroupId = selectedGroupId || defaultGroup?.id || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }

    try {
      setIsLoading(true);
      const res = await orgApi.addMember(orgId, {
        email: email.trim(),
        groupId: activeGroupId,
      });

      setSuccessMsg(res.message || 'Invitation sent successfully!');
      setTimeout(() => {
        onInviteSuccess?.(res.member);
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message || 'Failed to invite member');
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
          maxWidth: '480px',
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
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserPlus size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                Invite Member
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Add a teammate to collaborate in this organization
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
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
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

          {successMsg && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--ok-bg)',
                border: '1px solid var(--ok-border)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--ok)',
                fontSize: '13px',
              }}
            >
              <CheckCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Email input */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Email Address <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <Input
              type="email"
              placeholder="e.g. teammate@company.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoFocus
            />
          </div>

          {/* Initial Group / Role selection */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Assigned Group / Role
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {groups.map((group) => {
                const isSelected = activeGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: isSelected ? 'var(--surface-active)' : 'var(--surface-input)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="roleGroup"
                      checked={isSelected}
                      onChange={() => setSelectedGroupId(group.id)}
                      style={{ marginTop: '2px', accentColor: 'var(--accent)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                          {group.name}
                        </span>
                        {group.isSystem && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: 'var(--radius-full)',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              color: 'var(--text-dim)',
                            }}
                          >
                            System
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {group.description || `${group.name} role within the organization`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer action buttons */}
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
            <Button variant="ghost" type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Sending Invite...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
