import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Shield,
  Key,
  Building,
  RefreshCw,
  Layers,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import { MembersTab } from './views/MembersTab.jsx';
import { GroupsTab } from './views/GroupsTab.jsx';
import { usePermissions } from './hooks/usePermissions.js';
import { orgApi } from '../../services/orgApi.js';

export function SettingsView({ user, organization, services = [] }) {
  const [activeTab, setActiveTab] = useState('members'); // 'members' | 'groups' | 'audit'
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const orgId = organization?.id || 'org-kamar-taj';

  // Find current user's membership and assigned groups
  const currentMember = members.find(
    (m) => m.userId === user?.id || m.user?.email === user?.email
  );
  const currentUserGroups = currentMember?.groups || [
    { code: 'SUPER_ADMIN', name: 'Super Admin' },
  ];

  // RBAC hook
  const permissions = usePermissions(user, currentUserGroups);

  const fetchOrgData = useCallback(async () => {
    try {
      setError('');
      setIsRefreshing(true);
      const [membersRes, groupsRes] = await Promise.all([
        orgApi.listMembers(orgId).catch(() => ({ members: [] })),
        orgApi.listGroups(orgId).catch(() => ({ groups: [] })),
      ]);

      setMembers(membersRes.members || []);
      setGroups(groupsRes.groups || []);
    } catch (err) {
      console.warn('Failed to load organization settings:', err);
      setError(err.message || 'Failed to load organization settings');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchOrgData();
  }, [fetchOrgData]);

  return (
    <div
      style={{
        padding: '24px 32px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Settings Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Organization & Access Management
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                color: 'var(--accent)',
              }}
            >
              {organization?.slug || 'kamar-taj'}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Manage teammates, configure Role-Based Access Control (RBAC), and define service visibility
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchOrgData}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: isRefreshing ? 'wait' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw
              size={13}
              style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '2px',
        }}
      >
        <button
          onClick={() => setActiveTab('members')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            borderBottom: activeTab === 'members' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: activeTab === 'members' ? 'var(--surface-active)' : 'transparent',
            color: activeTab === 'members' ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: activeTab === 'members' ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Users size={16} />
          <span>Members</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: activeTab === 'members' ? 'var(--accent-subtle)' : 'var(--surface-input)',
              color: activeTab === 'members' ? 'var(--accent)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
          >
            {members.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            borderBottom: activeTab === 'groups' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: activeTab === 'groups' ? 'var(--surface-active)' : 'transparent',
            color: activeTab === 'groups' ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: activeTab === 'groups' ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Shield size={16} />
          <span>Roles & Groups</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: activeTab === 'groups' ? 'var(--accent-subtle)' : 'var(--surface-input)',
              color: activeTab === 'groups' ? 'var(--accent)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
            }}
          >
            {groups.length}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div>Loading organization members and permissions...</div>
        </div>
      ) : activeTab === 'members' ? (
        <MembersTab
          members={members}
          groups={groups}
          orgId={orgId}
          orgApi={orgApi}
          permissions={permissions}
          onRefresh={fetchOrgData}
        />
      ) : (
        <GroupsTab
          groups={groups}
          services={services}
          orgId={orgId}
          orgApi={orgApi}
          permissions={permissions}
          onRefresh={fetchOrgData}
        />
      )}
    </div>
  );
}
