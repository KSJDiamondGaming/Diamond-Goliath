import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardPage, {
  PrimaryButton,
  SectionCard,
} from '../components/Dashboard';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const EMPTY_FORM = {
  welcomeTitle: '',
  welcomeMessage: '',
  leaveTitle: '',
  leaveMessage: '',
};

const EMPTY_MESSAGE_DATA = {
  welcome: {
    channels: {},
    messages: {},
    titles: {},
  },
  leave: {
    channels: {},
    messages: {},
    titles: {},
  },
};

export default function Messages({ selectedGuild, theme }) {
  const [messageData, setMessageData] = useState(EMPTY_MESSAGE_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(`${API_BASE}/api/config/messages`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Request failed (${response.status}): ${text.slice(0, 160)}`);
        }

        const data = await response.json();

        if (!mounted) return;

        setMessageData({
          welcome: {
            channels: data?.welcome?.channels || {},
            messages: data?.welcome?.messages || {},
            titles: data?.welcome?.titles || {},
          },
          leave: {
            channels: data?.leave?.channels || {},
            messages: data?.leave?.messages || {},
            titles: data?.leave?.titles || {},
          },
        });
      } catch (err) {
        console.error('Failed to load welcome/leave config:', err);
        if (!mounted) return;
        setMessageData(EMPTY_MESSAGE_DATA);
        setError('Could not load welcome/leave config.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      mounted = false;
    };
  }, []);

  const guildValues = useMemo(() => {
    if (!selectedGuild) return EMPTY_FORM;

    return {
      welcomeTitle: messageData?.welcome?.titles?.[selectedGuild] || '',
      welcomeMessage: messageData?.welcome?.messages?.[selectedGuild] || '',
      leaveTitle: messageData?.leave?.titles?.[selectedGuild] || '',
      leaveMessage: messageData?.leave?.messages?.[selectedGuild] || '',
    };
  }, [selectedGuild, messageData]);

  useEffect(() => {
    setForm((prev) => {
      if (
        prev.welcomeTitle === guildValues.welcomeTitle &&
        prev.welcomeMessage === guildValues.welcomeMessage &&
        prev.leaveTitle === guildValues.leaveTitle &&
        prev.leaveMessage === guildValues.leaveMessage
      ) {
        return prev;
      }

      return guildValues;
    });
  }, [guildValues]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedGuild) {
      setSaveMessage('Select a server first.');
      return;
    }

    try {
      setSaveMessage('');
      setError('');

      const response = await fetch(`${API_BASE}/api/config/messages/${selectedGuild}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed (${response.status}): ${text.slice(0, 160)}`);
      }

      const result = await response.json();

      setMessageData((prev) => {
        const safePrev = prev || EMPTY_MESSAGE_DATA;

        return {
          ...safePrev,
          welcome: {
            ...(safePrev.welcome || {}),
            titles: {
              ...(safePrev.welcome?.titles || {}),
              [selectedGuild]: result?.data?.welcomeTitle || '',
            },
            messages: {
              ...(safePrev.welcome?.messages || {}),
              [selectedGuild]: result?.data?.welcomeMessage || '',
            },
          },
          leave: {
            ...(safePrev.leave || {}),
            titles: {
              ...(safePrev.leave?.titles || {}),
              [selectedGuild]: result?.data?.leaveTitle || '',
            },
            messages: {
              ...(safePrev.leave?.messages || {}),
              [selectedGuild]: result?.data?.leaveMessage || '',
            },
          },
        };
      });

      setSaveMessage('Welcome / leave messages saved successfully.');
    } catch (err) {
      console.error('Failed to save welcome/leave config:', err);
      setSaveMessage('Failed to save welcome / leave messages.');
    }
  }, [selectedGuild, form]);

  return (
    <DashboardPage
      title="Welcome & Leave"
      subtitle="Manage join and leave messaging for the selected guild."
      theme={theme}
    >
      {!selectedGuild ? (
        <div
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: '18px',
            padding: '18px',
            color: theme.mutedText,
            boxShadow: theme.shadow,
          }}
        >
          Select a guild to edit welcome and leave messages.
        </div>
      ) : null}

      {error ? <p style={{ color: '#ef4444', margin: 0 }}>{error}</p> : null}
      {saveMessage ? <p style={{ color: '#2563eb', margin: 0 }}>{saveMessage}</p> : null}

      {loading ? (
        <div
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: '18px',
            padding: '18px',
            color: theme.cardText,
            boxShadow: theme.shadow,
          }}
        >
          Loading welcome / leave settings...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.95fr)',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <SectionCard theme={theme} title="Edit Messages" padding="20px">
            <div style={{ display: 'grid', gap: '14px' }}>
              <Field label="Welcome Title" theme={theme}>
                <input
                  type="text"
                  value={form.welcomeTitle}
                  onChange={(e) => handleChange('welcomeTitle', e.target.value)}
                  style={inputStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <Field label="Welcome Message" theme={theme}>
                <textarea
                  value={form.welcomeMessage}
                  onChange={(e) => handleChange('welcomeMessage', e.target.value)}
                  style={textareaStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <Field label="Leave Title" theme={theme}>
                <input
                  type="text"
                  value={form.leaveTitle}
                  onChange={(e) => handleChange('leaveTitle', e.target.value)}
                  style={inputStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <Field label="Leave Message" theme={theme}>
                <textarea
                  value={form.leaveMessage}
                  onChange={(e) => handleChange('leaveMessage', e.target.value)}
                  style={textareaStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <div style={{ paddingTop: '4px' }}>
                <PrimaryButton onClick={handleSave} disabled={!selectedGuild}>
                  Save Messages
                </PrimaryButton>
              </div>
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gap: '20px' }}>
            <PreviewCard
              title={form.welcomeTitle || 'Welcome Preview'}
              message={
                form.welcomeMessage ||
                'Welcome {user} to {server}! You are member #{membercount}.'
              }
              borderColor="#2563eb"
              theme={theme}
            />

            <PreviewCard
              title={form.leaveTitle || 'Leave Preview'}
              message={
                form.leaveMessage ||
                '{username} has left the server. We now have {membercount} members.'
              }
              borderColor="#6b7280"
              theme={theme}
            />
          </div>
        </div>
      )}
    </DashboardPage>
  );
}

const Field = memo(function Field({ label, children, theme }) {
  return (
    <div>
      <p style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: 700, color: theme.mutedText, textTransform: 'uppercase' }}>
        {label}
      </p>
      {children}
    </div>
  );
});

const PreviewCard = memo(function PreviewCard({ title, message, borderColor, theme }) {
  return (
    <SectionCard
      theme={theme}
      title="Preview"
      padding="20px"
    >
      <div
        style={{
          borderRadius: '16px',
          background: theme.softBg,
          borderLeft: `6px solid ${borderColor}`,
          borderTop: `1px solid ${theme.cardBorder}`,
          borderRight: `1px solid ${theme.cardBorder}`,
          borderBottom: `1px solid ${theme.cardBorder}`,
          padding: '16px',
        }}
      >
        <h3 style={{ margin: 0, color: theme.cardText }}>{title}</h3>
        <p style={{ margin: '10px 0 0 0', color: theme.cardText, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
    </SectionCard>
  );
});

function inputStyle(theme) {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText,
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
  };
}

function textareaStyle(theme) {
  return {
    width: '100%',
    minHeight: '120px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText,
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
    resize: 'vertical',
    lineHeight: 1.6,
  };
}
