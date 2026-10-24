import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { Modal } from '../../components/Modal.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { memberService, rbacService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Users, UserPlus, Trash2, Shield, RefreshCw, Check, X } from 'lucide-react';

export function MembersView() {
  const { currentOrg } = useOrg();
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  // Group membership modal
  const [selectedMember, setSelectedMember] = useState(null);

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
      console.warn('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentOrg?.id]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
              {members.map((mem) => {
                const isOwner = mem.role === 'OWNER';
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
                          {(mem.name || mem.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{mem.name || 'Collaborator'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {mem.email}
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
                        {(mem.groups || ['Super Admins']).map((g, i) => (
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
                            {g}
                          </span>
                        ))}
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
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={() => handleRemoveMember(mem.id)}
                          style={{ color: 'var(--error)' }}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* RBAC Groups Breakdown */}
      <Card>
        <h2 className="text-section-title" style={{ fontSize: '15px', marginBottom: '14px' }}>
          Configured RBAC Security Groups
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {groups.map((grp) => (
            <div
              key={grp.id}
              style={{
                padding: '14px',
                backgroundColor: 'var(--surface-input)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{grp.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {grp.permissions?.length || 4} permissions
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {grp.description}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Invite Modal */}
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
