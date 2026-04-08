import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import DashboardPage, {
  PrimaryButton,
  SectionCard,
} from '../components/DashboardPage';

const EMPTY_FORM = {
  defaultTitle: '',
  footerText: '',
  footerIcon: '',
  color: '',
};

export default function Config({ selectedGuild, theme }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!selectedGuild) {
        if (mounted) {
          setForm(EMPTY_FORM);
          setError('');
          setSaveMessage('');
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSaveMessage('');

        const config = await api.getConfig(selectedGuild);

        if (!mounted) return;

        setForm({
          defaultTitle: config?.defaultTitle || '',
          footerText: config?.footerText || '',
          footerIcon: config?.footerIcon || '',
          color: config?.color || '',
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;

        setForm(EMPTY_FORM);
        setError('Could not load config.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => {
      if (prev[field] === value) return prev;

      return {
        ...prev,
        [field]: value,
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedGuild) {
      setSaveMessage('Select a guild first.');
      return;
    }

    try {
      setSaveMessage('');
      setError('');

      await api.updateConfig(selectedGuild, form);

      setSaveMessage('Embed config saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('Failed to save embed config.');
    }
  }, [selectedGuild, form]);

  const previewBorderColor = useMemo(() => form.color || '#2b2d31', [form.color]);

  return (
    <DashboardPage
      title="Embed Config"
      subtitle={
        selectedGuild
          ? 'Edit the default embed style for the selected guild.'
          : 'Select a server to edit embed config.'
      }
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
          Select a guild to edit embed config.
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
          Loading embed config...
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
          <SectionCard theme={theme} title="Edit Embed Config" padding="20px">
            <div style={{ display: 'grid', gap: '14px' }}>
              <Field label="Default Title" theme={theme}>
                <input
                  type="text"
                  value={form.defaultTitle}
                  onChange={(e) => handleChange('defaultTitle', e.target.value)}
                  style={inputStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <Field label="Footer Text" theme={theme}>
                <input
                  type="text"
                  value={form.footerText}
                  onChange={(e) => handleChange('footerText', e.target.value)}
                  style={inputStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <Field label="Footer Icon URL" theme={theme}>
                <input
                  type="text"
                  value={form.footerIcon}
                  onChange={(e) => handleChange('footerIcon', e.target.value)}
                  style={inputStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <Field label="Color" theme={theme}>
                <input
                  type="text"
                  placeholder="#00ffae"
                  value={form.color}
                  onChange={(e) => handleChange('color', e.target.value)}
                  style={inputStyle(theme)}
                  disabled={!selectedGuild}
                />
              </Field>

              <div style={{ paddingTop: '4px' }}>
                <PrimaryButton onClick={handleSave} disabled={!selectedGuild}>
                  Save Config
                </PrimaryButton>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            theme={theme}
            title="Live Preview"
            subtitle="See how your embed style will look before saving."
            padding="20px"
          >
            <div
              style={{
                borderRadius: '16px',
                background: theme.softBg,
                borderLeft: `6px solid ${previewBorderColor}`,
                borderTop: `1px solid ${theme.cardBorder}`,
                borderRight: `1px solid ${theme.cardBorder}`,
                borderBottom: `1px solid ${theme.cardBorder}`,
                padding: '16px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.cardText }}>
                {form.defaultTitle || 'Preview Title'}
              </h3>

              <p style={{ margin: '10px 0 0 0', color: theme.cardText, lineHeight: 1.6 }}>
                This is how your embed style will look in KSJ Goliath.
              </p>

              <div style={{ marginTop: '14px', fontSize: '13px', color: theme.mutedText }}>
                {form.footerText || 'No footer text set'}
              </div>

              {form.footerIcon ? <PreviewImage src={form.footerIcon} theme={theme} /> : null}
            </div>
          </SectionCard>
        </div>
      )}
    </DashboardPage>
  );
}

const Field = memo(function Field({ label, children, theme }) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 6px 0',
          fontSize: '12px',
          fontWeight: 700,
          color: theme.mutedText,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
});

const PreviewImage = memo(function PreviewImage({ src, theme }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
  }, [src]);

  if (hidden || !src) return null;

  return (
    <div style={{ marginTop: '12px' }}>
      <img
        src={src}
        alt="Footer icon preview"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '999px',
          objectFit: 'cover',
          border: `1px solid ${theme.cardBorder}`,
        }}
        onError={() => setHidden(true)}
      />
    </div>
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