import React from 'react';

import useOwnerDeployments from '../../hooks/useOwnerDeployments.js';

export default function DeploymentCenter({ theme }) {
  const { deployments, loading, error } = useOwnerDeployments();

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  const environments = deployments.length
    ? deployments
    : [
        { environment: 'DEV', branch: 'dev', status: 'Pending API', commit: 'Pending' },
        { environment: 'BETA', branch: 'beta', status: 'Pending API', commit: 'Pending' },
        { environment: 'PRODUCTION', branch: 'production', status: 'Pending API', commit: 'Pending' },
      ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#60a5fa', fontWeight: 900, textTransform: 'uppercase' }}>
          Deployment Control
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Deployment Center
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Monitor build status, deployments, commits and runtime promotion pipelines.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
          gap: 14,
        }}
      >
        <DeploymentCard title="Queued Deployments" value="0" theme={theme} />
        <DeploymentCard title="Active Deployments" value={loading ? 'Loading' : '0'} theme={theme} />
        <DeploymentCard title="Successful Today" value="0" theme={theme} />
        <DeploymentCard title="Failed Deployments" value="0" theme={theme} />
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Environment Status</h3>

        <div style={{ display: 'grid', gap: 12 }}>
          {environments.map((deployment) => (
            <div
              key={deployment.environment}
              style={{
                border: '1px solid ' + theme.cardBorder,
                borderRadius: 14,
                padding: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{deployment.environment}</strong>

                <div style={{ color: theme.mutedText }}>
                  Branch: {deployment.branch || 'Pending'}
                </div>

                <div style={{ color: theme.mutedText }}>
                  Commit: {deployment.commit || deployment.commitSha || 'Pending'}
                </div>
              </div>

              <strong style={{ color: deployment.status === 'Healthy' ? '#22c55e' : '#f59e0b' }}>
                {deployment.status || 'Pending API'}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DeploymentCard({ title, value, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ color: theme.mutedText }}>
        {title}
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          marginTop: 8,
        }}
      >
        {value}
      </div>
    </div>
  );
}
