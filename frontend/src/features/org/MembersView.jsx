import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { Modal } from '../../components/Modal.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { memberService, rbacService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  RefreshCw,
  Plus,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Lock,
} from 'lucide-react';

export function MembersView() {
  const { currentOrg } = useOrg();
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  // Create Group Modal
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [isCodeManual, setIsCodeManual] = useState(false);
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState(new Set());
  const [createGroupLoading, setCreateGroupLoading] = useState(false);
  const [createGroupError, setCreateGroupError] = useState(null);

  // Group Details & Deletion
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [deletingGroupId, setDeletingGroupId] = useState(null);

  const fetchData = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const [membersRes, groupsRes, permsRes] = await Promise.all([
        memberService.listMembers(currentOrg.id),
        rbacService.listGroups(currentOrg.id).catch(() => ({ groups: [] })),
        rbacService.listPermissions().catch(() => ({ permissions: [] })),
      ]);
      setMembers(membersRes?.members || []);
      setGroups(groupsRes?.groups || []);
      setPermissions(permsRes?.permissions || []);
    } catch (err) {
      console.warn('Failed to load members or groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentOrg?.id]);

  // Auto-generate code from name unless user manually modified it
  const handleGroupNameChange = (e) => {
    const val = e.target.value;
    setGroupName(val);
    if (!isCodeManual) {
      setGroupCode(val.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
    }
  };

  const handleGroupCodeChange = (e) => {
    setIsCodeManual(true);
    setGroupCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
  };

  const togglePermission = (permId) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  };

  const handleSelectAllPermissions = () => {
    setSelectedPermissions(new Set(permissions.map((p) => p.id)));
  };

  const handleClearAllPermissions = () => {
    setSelectedPermissions(new Set());
  };

  const handleOpenCreateGroup = () => {
    setGroupName('');
    setGroupCode('');
    setIsCodeManual(false);
    setGroupDescription('');
    setSelectedPermissions(new Set());
    setCreateGroupError(null);
    setIsCreateGroupOpen(true);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setCreateGroupError('Group name is required');
      return;
    }
    setCreateGroupLoading(true);
    setCreateGroupError(null);

    try {
      await rbacService.createGroup(currentOrg.id, {
        name: groupName.trim(),
        code: groupCode.trim() || undefined,
        description: groupDescription.trim() || undefined,
        permissionIds: Array.from(selectedPermissions),
      });

      setIsCreateGroupOpen(false);
      await fetchData();
    } catch (err) {
      setCreateGroupError(err.message || 'Failed to create security group');
    } finally {
      setCreateGroupLoading(false);
    }
  };

  const handleDeleteGroup = async (group) => {
    if (group.isSystem) {
      alert('System groups cannot be deleted');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete group "${group.name}"?`)) {
      return;
    }

    setDeletingGroupId(group.id);
    try {
      await rbacService.deleteGroup(currentOrg.id, group.id);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete group');
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      await memberService.addMember(currentOrg.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setIsInviteModalOpen(false);
      setInviteEmail('');
      await fetchData();
    } catch (err) {
      setInviteError(err.message || 'Failed to invite member');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Revoke this member access from this workspace?')) return;
    try {
      await memberService.removeMember(currentOrg.id, memberId);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to remove member');
    }
  };

  // Group permissions by category for nice layout in creation modal
  const permissionsByCategory = useMemo(() => {
    const map = {};
    for (const p of permissions) {
      const cat = p.category || 'GENERAL';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return map;
  }, [permissions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Workspace Members & RBAC Groups</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Collaborators with granular role-based permissions to telemetry signals in{' '}
            <strong style={{ color: 'var(--accent)' }}>{currentOrg?.name}</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchData} isLoading={isLoading}>
            Refresh
          </Button>
          <Button variant="secondary" icon={Shield} onClick={handleOpenCreateGroup}>
            Create Security Group
          </Button>
          <Button variant="primary" icon={UserPlus} onClick={() => setIsInviteModalOpen(true)}>
            Invite Collaborator
          </Button>
        </div>
      </div>

      {/* Members Table Card */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 14px' }}>User Collaborator</th>
                <th style={{ padding: '12px 14px' }}>Role</th>
                <th style={{ padding: '12px 14px' }}>Assigned RBAC Groups</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No members in this workspace yet. Click "Invite Collaborator" to add team members.
                  </td>
                </tr>
              ) : (
                members.map((mem) => {
                  const isOwner = mem.role === 'OWNER';
                  const email = mem.user?.email || mem.email || 'unknown';
                  const name = mem.user?.name || mem.name || email.split('@')[0];
                  const memberGroups = Array.isArray(mem.groups) ? mem.groups : [];

                  return (
                    <tr key={mem.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--surface-input)',
                              color: 'var(--accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '12px',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isOwner ? 'var(--accent-subtle)' : 'var(--surface-input)',
                            color: isOwner ? 'var(--accent)' : 'var(--text)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {mem.role}
                        </span>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {memberGroups.length > 0 ? (
                            memberGroups.map((g, i) => {
                              const gName = typeof g === 'object' ? g.name : g;
                              return (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    backgroundColor: 'var(--surface-input)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {gName}
                                </span>
                              );
                            })
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>None</span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <StatusBadge
                          status={mem.status === 'ACTIVE' ? 'ok' : 'info'}
                          label={mem.status || 'ACTIVE'}
                          size="sm"
                        />
                      </td>

                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        {!isOwner && (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => handleRemoveMember(mem.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* RBAC Groups Breakdown */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 className="text-section-title" style={{ fontSize: '15px' }}>
              Configured RBAC Security Groups
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Security groups define sets of capabilities that can be assigned to team members.
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={Plus} onClick={handleOpenCreateGroup}>
            New Security Group
          </Button>
        </div>

        {groups.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No security groups found for this organization. Click "New Security Group" to create one.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {groups.map((grp) => {
              const isExpanded = expandedGroupId === grp.id;
              const permsList = grp.permissions || [];
              const isSystem = grp.isSystem;

              return (
                <div
                  key={grp.id}
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--surface-input)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{grp.name}</span>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isSystem ? 'var(--accent-subtle)' : 'rgba(56, 189, 248, 0.1)',
                            color: isSystem ? 'var(--accent)' : 'var(--info)',
                            border: `1px solid ${isSystem ? 'var(--accent)' : 'rgba(56, 189, 248, 0.3)'}`,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {isSystem ? 'SYSTEM' : 'CUSTOM'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {grp.code}
                      </div>
                    </div>

                    {!isSystem && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        isLoading={deletingGroupId === grp.id}
                        onClick={() => handleDeleteGroup(grp)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                    {grp.description || 'No description provided.'}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border-subtle)',
                      marginTop: 'auto',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {grp.memberCount ?? 0} members
                    </span>

                    <button
                      onClick={() => setExpandedGroupId(isExpanded ? null : grp.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 6px',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <span>{permsList.length} permissions</span>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '10px',
                        backgroundColor: 'var(--surface)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                      }}
                    >
                      {permsList.length === 0 ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No explicit permissions assigned</span>
                      ) : (
                        permsList.map((p, idx) => {
                          const pKey = typeof p === 'object' ? p.key || p.code : p;
                          const pDesc = typeof p === 'object' ? p.description : '';
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '11px',
                              }}
                            >
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{pKey}</span>
                              {pDesc && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{pDesc}</span>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create Custom Security Group Modal */}
      <Modal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        title="Create Custom Security Group"
        maxWidth="680px"
      >
        <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Group Name"
              placeholder="e.g. SRE Incident Responders"
              value={groupName}
              onChange={handleGroupNameChange}
              required
              autoFocus
            />

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
                Group Code
              </label>
              <input
                type="text"
                placeholder="e.g. SRE_INCIDENT_RESPONDERS"
                value={groupCode}
                onChange={handleGroupCodeChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--surface-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
              Description
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Granted access to view metrics, query trace flows, and generate staging ingestion keys"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: '12px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Granular Permissions Selection */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                  Assign Capabilities & Permissions
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  ({selectedPermissions.size} selected of {permissions.length})
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" size="sm" type="button" onClick={handleSelectAllPermissions}>
                  Select All
                </Button>
                <Button variant="secondary" size="sm" type="button" onClick={handleClearAllPermissions}>
                  Clear
                </Button>
              </div>
            </div>

            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--surface-input)',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {Object.keys(permissionsByCategory).length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Loading permission matrix...
                </div>
              ) : (
                Object.entries(permissionsByCategory).map(([category, perms]) => (
                  <div key={category}>
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        color: 'var(--accent)',
                        marginBottom: '6px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {category.replace('_', ' ')}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px' }}>
                      {perms.map((p) => {
                        const isChecked = selectedPermissions.has(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePermission(p.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isChecked ? 'rgba(0, 255, 149, 0.06)' : 'var(--surface)',
                              border: `1px solid ${isChecked ? 'rgba(0, 255, 149, 0.35)' : 'var(--border-subtle)'}`,
                              cursor: 'pointer',
                              transition: 'all 0.12s ease',
                            }}
                          >
                            <div style={{ marginTop: '2px', color: isChecked ? 'var(--accent)' : 'var(--text-muted)' }}>
                              {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)', fontWeight: 600 }}>
                                  {p.key}
                                </span>
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3', marginTop: '2px' }}>
                                {p.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {createGroupError && (
            <div style={{ color: 'var(--error)', fontSize: '12px', padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              {createGroupError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="secondary" type="button" onClick={() => setIsCreateGroupOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={createGroupLoading}>
              Create Security Group
            </Button>
          </div>
        </form>
      </Modal>

      {/* Invite Collaborator Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite Member to Workspace"
      >
        <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Email Address"
            type="email"
            placeholder="colleague@domain.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
              Workspace Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                outline: 'none',
                fontSize: '13px',
              }}
            >
              <option value="MEMBER">Member (Read & Ingest Telemetry)</option>
              <option value="ADMIN">Admin (Manage Members & Keys)</option>
              <option value="OWNER">Owner (Full Workspace Control)</option>
            </select>
          </div>

          {inviteError && (
            <div style={{ color: 'var(--error)', fontSize: '13px' }}>{inviteError}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setIsInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={inviteLoading}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
