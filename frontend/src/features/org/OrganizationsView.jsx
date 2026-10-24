import React, { useState } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { Modal } from '../../components/Modal.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useOrg } from '../../context/OrgContext.jsx';
import { Building2, Plus, Edit2, Trash2, Check, ExternalLink } from 'lucide-react';

export function OrganizationsView() {
  const { orgs, currentOrg, switchOrg, createOrg, updateOrg, deleteOrg } = useOrg();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);

  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleOpenCreate = () => {
    setFormName('');
    setFormSlug('');
    setErrorMsg(null);
    setEditingOrg(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (org, e) => {
    e.stopPropagation();
    setEditingOrg(org);
    setFormName(org.name);
    setFormSlug(org.slug);
    setErrorMsg(null);
    setIsCreateModalOpen(true);
  };

  const handleDelete = async (orgId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this organization workspace?')) return;
    try {
      await deleteOrg(orgId);
    } catch (err) {
      alert(err.message || 'Failed to delete organization');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingOrg) {
        await updateOrg(editingOrg.id, { name: formName.trim(), slug: formSlug.trim() });
      } else {
        await createOrg({ name: formName.trim(), slug: formSlug.trim() });
      }
      setIsCreateModalOpen(false);
    } catch (err) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Organization Workspaces</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Multi-tenant workspaces isolate telemetry pipelines, retention policies, and API ingestion keys.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={handleOpenCreate}>
          New Organization
        </Button>
      </div>

      {/* Grid of Organizations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
        {orgs.map((org) => {
          const isSelected = org.id === currentOrg?.id;
          return (
            <Card
              key={org.id}
              hoverable
              onClick={() => switchOrg(org.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius)',
                      backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--surface-input)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                      {org.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      slug: {org.slug}
                    </div>
                  </div>
                </div>

                {isSelected ? (
                  <StatusBadge status="accent" label="Active Workspace" />
                ) : (
                  <StatusBadge status="info" label="Select" />
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  padding: '10px',
                  backgroundColor: 'var(--surface-input)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Role Access</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    {org.role || 'OWNER'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ingestion Keys</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {org.keyCount || 2} active
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Edit2}
                  onClick={(e) => handleOpenEdit(org, e)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={(e) => handleDelete(org.id, e)}
                  style={{ color: 'var(--error)' }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={editingOrg ? `Update ${editingOrg.name}` : 'Create Organization Workspace'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Organization Workspace Name"
            placeholder="e.g. Production Cluster East"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              if (!editingOrg && !formSlug) {
                setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
              }
            }}
            required
            autoFocus
          />

          <Input
            label="Slug Identifier"
            placeholder="e.g. prod-cluster-east"
            value={formSlug}
            onChange={(e) => setFormSlug(e.target.value)}
            helper="Telemetry partition key for ClickHouse queries"
            required
          />

          {errorMsg && (
            <div style={{ color: 'var(--error)', fontSize: '13px' }}>{errorMsg}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {editingOrg ? 'Save Changes' : 'Create Workspace'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
