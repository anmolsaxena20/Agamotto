import React, { useState } from 'react';
import { Users, X, AlertCircle, Check } from 'lucide-react';
import { Button } from '../../../components/Button.jsx';
import { Input } from '../../../components/Input.jsx';
import { SYSTEM_PERMISSIONS } from '../../../services/orgApi.js';

export function CreateGroupModal({
  isOpen,
  onClose,
  onCreateSuccess,
  orgApi,
  orgId,
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermIds, setSelectedPermIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (val) => {
    setName(val);
    if (!code || code === name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')) {
      setCode(val.toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_'));
    }
  };

  const togglePermission = (permId) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    try {
      setIsLoading(true);
      const res = await orgApi.createGroup(orgId, {
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        permissionIds: selectedPermIds,
      });

      onCreateSuccess?.(res.group);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create group');
    } finally {
      setIsLoading(false);
    }
  };

  // Group permissions by category
  const categories = Array.from(new Set(SYSTEM_PERMISSIONS.map((p) => p.category)));

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
          maxWidth: '560px',
          maxHeight: '90vh',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
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
              <Users size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                Create New Role / Group
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Define custom access privileges for organization members
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Group Name <span style={{ color: 'var(--accent)' }}>*</span>
                </label>
                <Input
                  placeholder="e.g. Incident Responder"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Identifier Code
                </label>
                <Input
                  placeholder="INCIDENT_RESPONDER"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Description
              </label>
              <Input
                placeholder="Brief summary of duties and permissions granted"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Permissions selection */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Assign Initial Permissions ({selectedPermIds.length} selected)
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedPermIds(selectedPermIds.length === SYSTEM_PERMISSIONS.length ? [] : SYSTEM_PERMISSIONS.map((p) => p.id))}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}
                >
                  {selectedPermIds.length === SYSTEM_PERMISSIONS.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {categories.map((category) => {
                  const perms = SYSTEM_PERMISSIONS.filter((p) => p.category === category);
                  return (
                    <div
                      key={category}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--surface-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.04em', marginBottom: '8px' }}>
                        {category}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                        {perms.map((p) => {
                          const isChecked = selectedPermIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: isChecked ? 'var(--text)' : 'var(--text-muted)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(p.id)}
                                style={{ accentColor: 'var(--accent)', marginTop: '2px' }}
                              />
                              <div>
                                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                  {p.key}
                                </span>
                                <span style={{ color: 'var(--text-dim)', marginLeft: '6px', fontSize: '11px' }}>
                                  — {p.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '16px 20px',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
            }}
          >
            <Button variant="ghost" type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Role'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
