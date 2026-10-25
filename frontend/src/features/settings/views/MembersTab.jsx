import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  Lock,
} from 'lucide-react';
import { Button } from '../../../components/Button.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import { LockedAction } from '../components/LockedAction.jsx';
import { InviteMemberModal } from '../components/InviteMemberModal.jsx';
import { EditMemberGroupsModal } from '../components/EditMemberGroupsModal.jsx';
import { RemoveMemberModal } from '../components/RemoveMemberModal.jsx';

export function MembersTab({
  members = [],
  groups = [],
  orgId,
  orgApi,
  permissions,
  onRefresh,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('ALL');
  
  // Modals state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [removingMember, setRemovingMember] = useState(null);

  // Permission capabilities
  const canInvite = permissions.hasPermission('members:invite');
  const canUpdate = permissions.hasPermission('members:update') || permissions.hasPermission('groups:assign_members');
  const canRemove = permissions.hasPermission('members:remove');

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const name = m.user?.name || '';
      const email = m.user?.email || '';
      const query = searchQuery.toLowerCase().trim();

      const matchesSearch = !query || name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
      const matchesGroup =
        selectedGroupFilter === 'ALL' ||
        (m.groups || []).some((g) => g.code === selectedGroupFilter || g.id === selectedGroupFilter);

      return matchesSearch && matchesGroup;
    });
  }, [members, searchQuery, selectedGroupFilter]);

  // Statistics
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;
  const pendingCount = members.filter((m) => m.status === 'PENDING').length;
  const planSeatsLimit = 10; // Free / Standard plan limit from feature 27

  // Helper for role badge colors
  const getGroupBadgeStyle = (code) => {
    switch (code) {
      case 'SUPER_ADMIN':
        return {
          backgroundColor: 'rgba(224, 176, 80, 0.15)',
          color: 'var(--accent)',
          border: '1px solid rgba(224, 176, 80, 0.35)',
        };
      case 'ADMIN':
        return {
          backgroundColor: 'rgba(64, 140, 255, 0.15)',
          color: '#58a6ff',
          border: '1px solid rgba(64, 140, 255, 0.35)',
        };
      case 'DEVELOPER':
        return {
          backgroundColor: 'rgba(63, 182, 139, 0.15)',
          color: 'var(--ok)',
          border: '1px solid rgba(63, 182, 139, 0.35)',
        };
      case 'VIEWER':
      default:
        return {
          backgroundColor: 'rgba(139, 148, 165, 0.15)',
          color: 'var(--text-muted)',
          border: '1px solid rgba(139, 148, 165, 0.25)',
        };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPI & Quota Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600 }}>
            Total Members
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>
            {members.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Active across organization
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600 }}>
            Active / Pending
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ok)' }}>{activeCount}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>active</span>
            {pendingCount > 0 && (
              <>
                <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--warn)', marginLeft: '6px' }}>{pendingCount}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>pending</span>
              </>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Verified accounts
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600 }}>
              Plan Seat Quota
            </div>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(224, 176, 80, 0.15)',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              Standard Tier
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>
            {members.length} <span style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 400 }}>/ {planSeatsLimit} seats</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {planSeatsLimit - members.length} available seats remaining
          </div>
        </div>
      </div>

      {/* Action and Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              gap: '8px',
              flex: 1,
              maxWidth: '360px',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '12px',
                width: '100%',
              }}
            />
          </div>

          {/* Role Filter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              gap: '6px',
            }}
          >
            <Filter size={13} style={{ color: 'var(--text-dim)' }} />
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <option value="ALL" style={{ backgroundColor: 'var(--surface)' }}>All Roles</option>
              {groups.map((g) => (
                <option key={g.id} value={g.code} style={{ backgroundColor: 'var(--surface)' }}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Invite Member Button */}
        <LockedAction
          isAllowed={canInvite}
          reason="Requires 'members:invite' permission. Contact your organization administrator."
        >
          <Button
            variant="primary"
            onClick={() => setIsInviteOpen(true)}
            disabled={!canInvite}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UserPlus size={15} />
            <span>Invite Member</span>
          </Button>
        </LockedAction>
      </div>

      {/* Members Table */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border)',
                  backgroundColor: 'var(--surface-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Member</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assigned Roles / Groups</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date Added</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No organization members found matching your search criteria.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const user = member.user || {};
                  const isCreator = member.isCreator || false;
                  const initials = (user.name || user.email || 'U')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr
                      key={member.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Member Identity */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--surface-active)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '12px',
                              color: 'var(--accent)',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                {user.name || 'Unnamed Member'}
                              </span>
                              {isCreator && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    padding: '1px 5px',
                                    borderRadius: 'var(--radius-full)',
                                    backgroundColor: 'rgba(224, 176, 80, 0.15)',
                                    color: 'var(--accent)',
                                    fontWeight: 600,
                                  }}
                                  title="Organization Owner / Creator"
                                >
                                  Owner
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Assigned Groups / Roles */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          {(member.groups || []).map((grp) => {
                            const badgeStyle = getGroupBadgeStyle(grp.code);
                            return (
                              <span
                                key={grp.id}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  fontWeight: 600,
                                  ...badgeStyle,
                                }}
                              >
                                {grp.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <StatusBadge
                          status={member.status === 'ACTIVE' ? 'active' : 'warn'}
                          label={member.status === 'ACTIVE' ? 'Active' : 'Pending'}
                        />
                      </td>

                      {/* Date Joined */}
                      <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(member.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {/* Edit Roles */}
                          <LockedAction
                            isAllowed={canUpdate}
                            reason="Requires 'groups:assign_members' permission."
                          >
                            <button
                              onClick={() => setEditingMember(member)}
                              disabled={!canUpdate}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'none',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '4px 8px',
                                color: 'var(--text-secondary)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                              }}
                              title="Modify Role Assignments"
                            >
                              <Shield size={12} />
                              <span>Roles</span>
                            </button>
                          </LockedAction>

                          {/* Remove Member */}
                          <LockedAction
                            isAllowed={canRemove && !isCreator}
                            reason={isCreator ? 'Organization creator cannot be removed' : "Requires 'members:remove' permission"}
                          >
                            <button
                              onClick={() => setRemovingMember(member)}
                              disabled={!canRemove || isCreator}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'none',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '4px 8px',
                                color: isCreator ? 'var(--text-dim)' : 'var(--error)',
                                cursor: isCreator ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s',
                              }}
                              title={isCreator ? 'Owner cannot be removed' : 'Remove Member'}
                            >
                              <Trash2 size={13} />
                            </button>
                          </LockedAction>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <InviteMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        groups={groups}
        orgId={orgId}
        orgApi={orgApi}
        onInviteSuccess={() => {
          onRefresh?.();
        }}
      />

      <EditMemberGroupsModal
        isOpen={Boolean(editingMember)}
        member={editingMember}
        allGroups={groups}
        allMembers={members}
        orgId={orgId}
        orgApi={orgApi}
        onClose={() => setEditingMember(null)}
        onUpdateSuccess={() => {
          onRefresh?.();
        }}
      />

      <RemoveMemberModal
        isOpen={Boolean(removingMember)}
        member={removingMember}
        orgId={orgId}
        orgApi={orgApi}
        onClose={() => setRemovingMember(null)}
        onRemoveSuccess={() => {
          onRefresh?.();
        }}
      />
    </div>
  );
}
