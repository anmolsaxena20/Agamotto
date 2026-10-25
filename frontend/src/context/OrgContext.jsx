import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { orgService } from '../services/apiServices.js';
import { useAuth } from './AuthContext.jsx';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  const fetchOrgs = useCallback(async () => {
    if (!isAuthenticated) {
      setOrgs([]);
      setCurrentOrg(null);
      return;
    }

    setIsLoadingOrgs(true);
    try {
      const res = await orgService.listOrgs();
      const list = res?.organizations || [];
      setOrgs(list);

      // Restore previously selected org or default to first
      const savedOrgId = localStorage.getItem('agamotto_active_org_id');
      const found = list.find((o) => o.id === savedOrgId);
      if (found) {
        setCurrentOrg(found);
      } else if (list.length > 0) {
        setCurrentOrg(list[0]);
        localStorage.setItem('agamotto_active_org_id', list[0].id);
      }
    } catch (err) {
      console.warn('Failed to fetch user organizations:', err);
    } finally {
      setIsLoadingOrgs(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const switchOrg = (orgId) => {
    const target = orgs.find((o) => o.id === orgId);
    if (target) {
      setCurrentOrg(target);
      localStorage.setItem('agamotto_active_org_id', target.id);
    }
  };

  const createOrg = async ({ name, slug }) => {
    const res = await orgService.createOrg({ name, slug });
    const newOrg = res.organization;
    await fetchOrgs();
    if (newOrg) {
      setCurrentOrg(newOrg);
      localStorage.setItem('agamotto_active_org_id', newOrg.id);
    }
    return newOrg;
  };

  const updateOrg = async (orgId, data) => {
    const res = await orgService.updateOrg(orgId, data);
    await fetchOrgs();
    return res;
  };

  const deleteOrg = async (orgId) => {
    await orgService.deleteOrg(orgId);
    await fetchOrgs();
  };

  return (
    <OrgContext.Provider
      value={{
        orgs,
        currentOrg,
        isLoadingOrgs,
        switchOrg,
        createOrg,
        updateOrg,
        deleteOrg,
        refreshOrgs: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}
