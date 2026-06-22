import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { EmptyState, LoadingPanel, Notice, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function formatDate(value) {
  if (!value) return 'No expiry';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No expiry' : date.toLocaleString();
}

function formatLimit(value) {
  if (value == null) return 'Unlimited';
  return Number(value).toLocaleString();
}

function DetailCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: theme.cardText, fontWeight: 950, overflowWrap: 'anywhere' }}>{value || 'None'}</div>
      {hint ? <div style={{ color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </div>
  );
}

function FeaturePill({ theme, feature }) {
  return (
    <span style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', color: theme.cardText, borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 900 }}>
      {feature}
    </span>
  );
}

function PlanCard({ theme, plan, current }) {
  return (
    <div style={{ border: `1px solid ${current ? '#86efac' : theme.cardBorder}`, background: current ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.24)', borderRadius: 18, padding: 16, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <strong style={{ color: theme.cardText, fontSize: 18 }}>{plan.icon} {plan.name}</strong>
        {current ? <span style={{ color: '#86efac', fontWeight: 950, fontSize: 12, textTransform: 'uppercase' }}>Current</span> : null}
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>
        {plan.public === false ? 'Hidden owner-granted plan.' : 'Available Goliath plan.'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {asArray(plan.features).slice(0, 5).map((feature) => <FeaturePill key={feature} theme={theme} feature={feature} />)}
      </div>
    </div>
  );
}

export default function Billing({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [plansPayload, setPlansPayload] = useState(null);
  const [subscriptionPayload, setSubscriptionPayload] = useState(null);
  const [entitlementsPayload, setEntitlementsPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const plans = useMemo(() => asArray(plansPayload?.plans), [plansPayload]);
  const subscription = subscriptionPayload?.subscription || entitlementsPayload?.subscription || {};
  const currentPlan = subscriptionPayload?.plan || entitlementsPayload?.plan || {};
  const features = asArray(entitlementsPayload?.features || currentPlan.features);
  const limits = entitlementsPayload?.limits || currentPlan.limits || {};

  useEffect(() => {
    if (!guildId) return undefined;
    let cancelled = false;

    async function loadBilling() {
      setLoading(true);
      setError('');

      try {
        const [plansResult, subscriptionResult, entitlementResult] = await Promise.all([
          api.getBillingPlans(),
          api.getBillingSubscription(guildId),
          api.getBillingEntitlements(guildId),
        ]);

        if (cancelled) return;
        setPlansPayload(plansResult);
        setSubscriptionPayload(subscriptionResult);
        setEntitlementsPayload(entitlementResult);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Failed to load billing details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBilling();
    return () => { cancelled = true; };
  }, [guildId]);

  if (!guildId) {
    return (
      <PageShell title="Billing" subtitle="Select a server to view its Goliath plan and entitlements." theme={theme}>
        <EmptyState theme={theme} text="Select a server to view billing." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Billing"
      subtitle="View this server's plan, subscription status, features and limits."
      theme={theme}
      guild={{ id: guildId, name: selectedGuildData?.name || selectedGuildData?.guildName || 'Selected Server', iconUrl: selectedGuildData?.iconUrl || selectedGuildData?.iconURL }}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading billing..." /> : null}

      <StatGrid min="min(190px, 100%)">
        <SummaryStat theme={theme} label="Current Plan" value={`${currentPlan.icon || ''} ${currentPlan.name || subscription.plan || 'Free'}`} accent="#86efac" description="Guild subscription plan" />
        <SummaryStat theme={theme} label="Status" value={subscription.status || 'active'} accent="#3b82f6" description="Subscription status" />
        <SummaryStat theme={theme} label="Source" value={subscription.source || 'system'} accent="#a855f7" description="How access was granted" />
        <SummaryStat theme={theme} label="Expires" value={formatDate(subscription.expiresAt)} accent="#f59e0b" description="Renewal or expiry date" />
      </StatGrid>

      <SectionCard theme={theme} title="Plan Features" subtitle="Features currently unlocked for this server.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {features.length ? features.map((feature) => <FeaturePill key={feature} theme={theme} feature={feature} />) : <EmptyState theme={theme} text="No feature entitlements found." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Current Limits" subtitle="Plan limits from the entitlement system.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 12 }}>
          {Object.keys(limits).length ? Object.entries(limits).map(([key, value]) => (
            <DetailCard key={key} theme={theme} label={key} value={formatLimit(value)} />
          )) : <EmptyState theme={theme} text="No plan limits found." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Available Plans" subtitle="Billing navigation lives in the topbar. This page is not a sidebar module.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
          {plans.map((plan) => <PlanCard key={plan.id} theme={theme} plan={plan} current={plan.id === subscription.plan} />)}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Next Billing Actions" subtitle="Placeholders for the next billing phases.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailCard theme={theme} label="Upgrade" value="Coming soon" hint="Stripe checkout will connect here later." />
          <DetailCard theme={theme} label="Redeem Code" value="Coming soon" hint="GOL-PLUS / GOL-PRO / GOL-LIFE code redemption." />
          <DetailCard theme={theme} label="Billing History" value="Coming soon" hint="Invoices and subscription events after Stripe integration." />
        </div>
      </SectionCard>
    </PageShell>
  );
}
