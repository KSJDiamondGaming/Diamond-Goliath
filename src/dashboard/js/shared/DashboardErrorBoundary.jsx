import React from 'react';

export default class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DashboardErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo });
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, errorInfo: null });
    }
  }

  render() {
    const { error, errorInfo } = this.state;
    const { children, theme } = this.props;

    if (!error) return children;

    const cardBorder = theme?.cardBorder || 'rgba(148,163,184,0.22)';
    const cardBg = theme?.cardBg || 'rgba(15,23,42,0.86)';
    const cardText = theme?.cardText || '#f8fafc';
    const mutedText = theme?.mutedText || '#94a3b8';

    return (
      <section style={{
        border: `1px solid ${cardBorder}`,
        background: cardBg,
        color: cardText,
        borderRadius: 22,
        padding: 22,
        display: 'grid',
        gap: 14,
        boxShadow: theme?.shadow || 'none',
      }}>
        <div>
          <p style={{ margin: 0, color: '#fca5a5', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Dashboard render error
          </p>
          <h2 style={{ margin: '8px 0 0' }}>This page failed to load.</h2>
          <p style={{ margin: '8px 0 0', color: mutedText, lineHeight: 1.55 }}>
            The dashboard caught a frontend error instead of showing a blank white screen. Copy the message below if this happens again after deployment.
          </p>
        </div>

        <pre style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          overflowX: 'auto',
          border: `1px solid ${cardBorder}`,
          borderRadius: 14,
          padding: 14,
          background: 'rgba(2,6,23,0.45)',
          color: '#fecaca',
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          {error?.stack || error?.message || String(error)}
        </pre>

        {errorInfo?.componentStack ? (
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
            border: `1px solid ${cardBorder}`,
            borderRadius: 14,
            padding: 14,
            background: 'rgba(2,6,23,0.32)',
            color: mutedText,
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            {errorInfo.componentStack}
          </pre>
        ) : null}
      </section>
    );
  }
}
