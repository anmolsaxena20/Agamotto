import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Save,
  RotateCcw,
  Lock,
  Layers,
  Server,
  Info,
} from 'lucide-react';
import { Button } from '../../../components/Button.jsx';
import { LockedAction } from '../components/LockedAction.jsx';
import { CreateGroupModal } from '../components/CreateGroupModal.jsx';
import { SYSTEM_PERMISSIONS } from '../../../services/orgApi.js';

export function GroupsTab({
  groups = [],
  services = [],
  orgId,
  orgApi,
  permissions: userPerms,
  onRefresh,
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id || '');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Currently selected group
  const activeGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedGroupId) || groups[0] || null;
  }, [groups, selectedGroupId]);

  // Working permissions state for the active group (to track unsaved changes)
  const [currentPermKeys, setCurrentPermKeys] = useState(new Set());
  const [selectedServices, setSelectedServices] = useState([]); // empty means all services

  // When activeGroup changes, reset working permissions
  useEffect(() => {
    if (activeGroup) {
      const keys = new Set((activeGroup.permissions || []).map((p) => (typeof p === 'string' ? p : p.key)));
      setCurrentPermKeys(keys);
      setSelectedServices(activeGroup.visibleServices || []);
      setFeedback({ type: '', message: '' });
    }
  }, [activeGroup]);

  // Check if there are unsaved permission changes
  const hasUnsavedChanges = useMemo(() => {
    if (!activeGroup) return false;
    const originalKeys = new Set((activeGroup.permissions || []).map((p) => (typeof p === 'string' ? p : p.key)));
    if (originalKeys.size !== currentPermKeys.size) return true;
    for (const key of currentPermKeys) {
      if (!originalKeys.has(key)) return true;
    }
    return false;
  }, [activeGroup, currentPermKeys]);

  const canManageGroups = userPerms.hasPermission('groups:manage');
  const canAssignPerms = userPerms.hasPermission('groups:assign_permissions');
  const isSuperAdminGroup = activeGroup?.code === 'SUPER_ADMIN';

  const togglePermission = (permKey) => {
    if (isSuperAdminGroup) return; // Super admin permissions cannot be altered

    const next = new Set(currentPermKeys);
    if (next.has(permKey)) {
      next.delete(permKey);
    } else {
      next.add(permKey);
    }
    setCurrentPermKeys(next);
  };

  const handleRevert = () => {
    if (activeGroup) {
      const keys = new Set((activeGroup.permissions || []).map((p) => (typeof p === 'string' ? p : p.key)));
      setCurrentPermKeys(keys);
    }
  };

  const handleSavePermissions = async () => {
    if (!activeGroup || isSuperAdminGroup) return;

    try {
      setIsSaving(true);
      setFeedback({ type: '', message: '' });

      const originalKeys = new Set((activeGroup.permissions || []).map((p) => (typeof p === 'string' ? p : p.key)));

      // Permissions to add
      for (const key of currentPermKeys) {
        if (!originalKeys.has(key)) {
          await orgApi.assignPermissionToGroup(orgId, activeGroup.id, null, key);
        }
      }

      // Permissions to remove
      for (const key of originalKeys) {
        if (!currentPermKeys.has(key)) {
          const permObj = SYSTEM_PERMISSIONS.find((p) => p.key === key);
          await orgApi.removePermissionFromGroup(orgId, activeGroup.id, permObj?.id || key);
        }
      }

      setFeedback({ type: 'success', message: 'Group permissions updated successfully' });
      onRefresh?.();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save permissions' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group? Members will lose this role.')) return;
    try {
      await orgApi.deleteGroup(orgId, groupId);
      onRefresh?.();
      setSelectedGroupId(groups[0]?.id || '');
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete group' });
    }
  };

  // Group master permissions by category
  const categories = useMemo(() => {
    return Array.from(new Set(SYSTEM_PERMISSIONS.map((p) => p.category)));
  }, []);

  const defaultServicesList = services.length > 0 ? services : [
    'server',
    'gateway-api',
    'email-service',
    'order-service',
    'payment-service',
    'inventory-service',
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', alignItems: 'start' }}>
      {/* Left Column: Groups List */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              Organization Roles
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {groups.length} defined groups
            </div>
          </div>

          <LockedAction
            isAllowed={canManageGroups}
            reason="Requires 'groups:manage' permission"
          >
            <button
              onClick={() => setIsCreateOpen(true)}
              disabled={!canManageGroups}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: 'var(--accent-subtle)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                color: 'var(--accent)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={12} />
              <span>Role</span>
            </button>
          </LockedAction>
        </div>

        {/* Group item list */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {groups.map((grp) => {
            const isSelected = activeGroup?.id === grp.id;
            return (
              <div
                key={grp.id}
                onClick={() => setSelectedGroupId(grp.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: isSelected ? 'var(--surface-active)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield
                      size={13}
                      style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 500, color: 'var(--text)' }}>
                      {grp.name}
                    </span>
                  </div>

                  {grp.isSystem && (
                    <span
                      style={{
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--text-dim)',
                        fontWeight: 600,
                      }}
                    >
                      System
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    {grp.code}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {grp.memberCount || 0} members
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Permission Matrix & Scope Settings */}
      {activeGroup ? (
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Group Header & Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                  {activeGroup.name}
                </h3>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--surface-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {activeGroup.code}
                </span>
                {activeGroup.isSystem && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'rgba(224, 176, 80, 0.15)',
                      color: 'var(--accent)',
                      fontWeight: 600,
                    }}
                  >
                    Built-in System Role
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {activeGroup.description || 'Custom role configured for organization members'}
              </p>
            </div>

            {/* Custom group delete button */}
            {!activeGroup.isSystem && (
              <LockedAction
                isAllowed={canManageGroups}
                reason="Requires 'groups:manage' permission"
              >
                <button
                  onClick={() => handleDeleteGroup(activeGroup.id)}
                  disabled={!canManageGroups}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px',
                    color: 'var(--error)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} />
                  <span>Delete Role</span>
                </button>
              </LockedAction>
            )}
          </div>

          {/* Feedback banner */}
          {feedback.message && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: feedback.type === 'success' ? 'var(--ok-bg)' : 'var(--error-bg)',
                border: `1px solid ${feedback.type === 'success' ? 'var(--ok-border)' : 'var(--error-border)'}`,
                color: feedback.type === 'success' ? 'var(--ok)' : 'var(--error)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              {feedback.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Super Admin Special Notice */}
          {isSuperAdminGroup && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                backgroundColor: 'rgba(224, 176, 80, 0.1)',
                border: '1px solid rgba(224, 176, 80, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: '12px',
              }}
            >
              <Info size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--accent)' }}>Super Admin privileges are fixed:</strong>{' '}
                Members with the Super Admin role inherit all existing and future permissions automatically.
                Permissions for this system group cannot be restricted.
              </div>
            </div>
          )}

          {/* Scope: Visible Services Selector */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Layers size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                Service Visibility Scope
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Restrict members of this group to inspect telemetry only from specific services. Leave empty to allow visibility across all services.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {defaultServicesList.map((svc) => {
                const isSelected = selectedServices.includes(svc);
                return (
                  <button
                    key={svc}
                    disabled={isSuperAdminGroup}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedServices(selectedServices.filter((s) => s !== svc));
                      } else {
                        setSelectedServices([...selectedServices, svc]);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: isSelected ? 'var(--surface-active)' : 'var(--surface-input)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      cursor: isSuperAdminGroup ? 'default' : 'pointer',
                    }}
                  >
                    <Server size={10} />
                    <span>{svc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission Matrix */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  Permission Matrix
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Granular functional capabilities assigned to this role
                </p>
              </div>

              {/* Dirty state & Save actions */}
              {hasUnsavedChanges && !isSuperAdminGroup && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={handleRevert}
                    disabled={isSaving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '5px 10px',
                      color: 'var(--text-dim)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Revert</span>
                  </button>

                  <LockedAction
                    isAllowed={canAssignPerms}
                    reason="Requires 'groups:assign_permissions' permission"
                  >
                    <Button
                      variant="primary"
                      onClick={handleSavePermissions}
                      disabled={isSaving || !canAssignPerms}
                      style={{ padding: '5px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Save size={13} />
                      <span>{isSaving ? 'Saving...' : 'Save Permissions'}</span>
                    </Button>
                  </LockedAction>
                </div>
              )}
            </div>

            {/* Categorized Permissions Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {categories.map((category) => {
                const categoryPerms = SYSTEM_PERMISSIONS.filter((p) => p.category === category);
                return (
                  <div
                    key={category}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--surface-subtle)',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--accent)',
                      }}
                    >
                      {category}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {categoryPerms.map((perm) => {
                        const isGranted = isSuperAdminGroup || currentPermKeys.has(perm.key);
                        return (
                          <div
                            key={perm.id}
                            onClick={() => !isSuperAdminGroup && togglePermission(perm.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderBottom: '1px solid var(--border-subtle)',
                              backgroundColor: isGranted ? 'rgba(224, 176, 80, 0.03)' : 'transparent',
                              cursor: isSuperAdminGroup ? 'default' : 'pointer',
                              transition: 'background-color 0.15s',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    fontFamily: 'var(--font-mono)',
                                    color: isGranted ? 'var(--text)' : 'var(--text-muted)',
                                  }}
                                >
                                  {perm.key}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                {perm.description}
                              </div>
                            </div>

                            <input
                              type="checkbox"
                              checked={isGranted}
                              disabled={isSuperAdminGroup}
                              onChange={() => !isSuperAdminGroup && togglePermission(perm.key)}
                              style={{
                                accentColor: 'var(--accent)',
                                width: '16px',
                                height: '16px',
                                cursor: isSuperAdminGroup ? 'default' : 'pointer',
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Select a role from the left column to view and configure permissions.
        </div>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        orgId={orgId}
        orgApi={orgApi}
        onCreateSuccess={(newGroup) => {
          onRefresh?.();
          setSelectedGroupId(newGroup.id);
        }}
      />
    </div>
  );
}
