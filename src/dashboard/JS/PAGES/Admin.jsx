import { useMemo } from 'react';
import PageShell, {
  EmptyState,
  SectionCard,
} from '../shared/PageShell';
import { PAGE_LAYOUTS, createSharedComponentStyles } from '../ui';

export default function Admin({ selectedGuild, theme }) {
  const styles = useMemo(() => createSharedComponentStyles(theme), [theme]);

  const page = PAGE_LAYOUTS.admin || {
    title: 'Admin',
    description: 'Core system configuration.',
    emptyDescription: 'Select a server to manage admin settings.',
  };

  return (
    <PageShell
      title={page.title}
      subtitle={
        selectedGuild
          ? page.description
          : page.emptyDescription
      }
      theme={theme}
    >
      {!selectedGuild && (
        <EmptyState theme={theme} text="Select a server to manage admin settings." />
      )}

      {selectedGuild && (
        <div style={styles.futurePage}>
          
          {/* MAIN PANEL */}
          <SectionCard theme={theme}>
            <div style={styles.futureInnerPanel}>
              <h3 style={{ margin: 0 }}>⚙️ Admin Control Center</h3>
              <p style={{ margin: 0, opacity: 0.7 }}>
                Manage core bot configuration and system-level controls.
              </p>
            </div>
          </SectionCard>

          {/* GRID */}
          <div style={styles.futureGrid}>

            <div style={styles.futurePanel}>
              <div style={styles.futureInnerPanel}>
                <h4 style={{ margin: 0 }}>🧩 General Settings</h4>
                <p style={{ margin: 0 }}>
                  Configure prefixes, system settings, and core behaviour.
                </p>
              </div>
            </div>

            <div style={styles.futurePanel}>
              <div style={styles.futureInnerPanel}>
                <h4 style={{ margin: 0 }}>🤖 AutoMod</h4>
                <p style={{ margin: 0 }}>
                  Manage filters, spam protection, and automated actions.
                </p>
              </div>
            </div>

            <div style={styles.futurePanel}>
              <div style={styles.futureInnerPanel}>
                <h4 style={{ margin: 0 }}>📨 Messages</h4>
                <p style={{ margin: 0 }}>
                  Configure welcome and leave messages.
                </p>
              </div>
            </div>

            <div style={styles.futurePanel}>
              <div style={styles.futureInnerPanel}>
                <h4 style={{ margin: 0 }}>📜 Logs</h4>
                <p style={{ margin: 0 }}>
                  Control logging channels and audit tracking.
                </p>
              </div>
            </div>

          </div>
        </div>
      )}
    </PageShell>
  );
}