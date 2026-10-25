import React, { useState } from 'react';
import { Shield, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/Button.jsx';

export function EditMemberGroupsModal({
  isOpen,
  onClose,
  member,
  allGroups = [],
  allMembers = [],
  onUpdateSuccess,
  orgApi,
  orgId,
}) {
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => {
    return (member?.groups || []).map((g) => g.id);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !member) return null;

  const currentGroupIds = new Set(selectedGroupIds);

  const toggleGroup = (groupId) => {
    setError('');
    const group = allGroups.find((g) => g.id === groupId);

    // Prevent removing last Super Admin
    if (group?.code === 'SUPER_ADMIN' && currentGroupIds.has(groupId)) {
      const superAdminMembers = allMembers.filter((m) =>
        m.groups.some((g) => g.code === 'SUPER_ADMIN')
      );
      if (superAdminMembers.length <= 1 && superAdminMembers[0]?.id === member.id) {
        setError('Cannot remove the last remaining Super Admin from the organization.');
        return;
      }
    }

    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) {
      if (next.size === 1) {
        setError('A member must belong to at least one group.');
        return;
      }
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setSelectedGroupIds(Array.from(next));
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError('');

    try {
      const initialIds = new Set((member.groups || []).map((g) => g.id));
      const targetIds = new Set(selectedGroupIds);

      // Groups to add
      for (const gid of targetIds) {
        if (!initialIds.has(gid)) {
          await orgApi.assignMemberToGroup(orgId, gid, member.id);
        }
      }

      // Groups to remove
      for (const gid of initialIds) {
        if (!targetIds.has(gid)) {
          await orgApi.removeMemberFromGroup(orgId, gid, member.id);
        }
      }

      const updatedGroups = allGroups
        .filter((g) => targetIds.has(g.id))
        .map((g) => ({ id: g.id, name: g.name, code: g.code, isSystem: g.isSystem }));

      onUpdateSuccess?.({ ...member, groups: updatedGroups });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update member groups');
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
          maxWidth: '500px',
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
              <Shield size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                Edit Member Roles
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {member.user?.name || member.user?.email}
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

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Assign this member to one or more groups. Permissions will be combined additively.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
            {allGroups.map((group) => {
              const isChecked = selectedGroupIds.includes(group.id);
              return (
                <div
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: isChecked ? 'var(--surface-active)' : 'var(--surface-input)',
                    border: `1px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {group.description || `${group.name} role`}
                    </div>
                  </div>

                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: `1px solid ${isChecked ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: isChecked ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0D1017',
                    }}
                  >
                    {isChecked && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Group Assignments'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
