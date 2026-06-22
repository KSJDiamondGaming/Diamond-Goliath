import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, {
  SectionCard,
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
  StatGrid,
  SummaryStat,
} from '../../shared/PageShell';

const DEFAULT_EMBED = {
  title: '',
  description: '',
  color: '#5865F2',
  author: { name: '', iconURL: '', url: '' },
  thumbnailURL: '',
  imageURL: '',
  footer: { text: '', iconURL: '' },
  fields: [],
  buttons: [],
};

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function normalizeEmbed(embed = {}) {
  return {
    ...DEFAULT_EMBED,
    ...(embed || {}),
    author: { ...DEFAULT_EMBED.author, ...(embed.author || {}) },
    footer: { ...DEFAULT_EMBED.footer, ...(embed.footer || {}) },
    fields: Array.isArray(embed.fields) ? embed.fields : [],
    buttons: Array.isArray(embed.buttons) ? embed.buttons : [],
  };
}

function TextField({ theme, label, value, onChange, placeholder, multiline = false }) {
  const inputStyle = {
    width: '100%',
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.55)',
    color: theme.cardText,
    borderRadius: 14,
    padding: '12px 14px',
    fontWeight: 750,
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      {multiline ? (
        <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={5} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      ) : (
        <input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </label>
  );
}

function Preview({ theme, content, embed }) {
  const data = normalizeEmbed(embed);
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: '#313338', color: '#dbdee1', borderRadius: 18, padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#5865F2,#22c55e)' }} />
        <div style={{ minWidth: 0, width: '100%' }}>
          <strong style={{ color: '#fff' }}>Goliath</strong>
          {content ? <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{content}</div> : null}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '4px 1fr', borderRadius: 6, overflow: 'hidden', background: '#2b2d31' }}>
            <div style={{ background: data.color || '#5865F2' }} />
            <div style={{ padding: 14, display: 'grid', gap: 8 }}>
              {data.author?.name ? <div style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{data.author.name}</div> : null}
              {data.title ? <div style={{ color: '#00a8fc', fontWeight: 800 }}>{data.title}</div> : null}
              {data.description ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{data.description}</div> : null}
              {(data.fields || []).map((field, index) => (
                <div key={`${field.name}-${index}`}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{field.name || 'Field'}</div>
                  <div style={{ color: '#dbdee1', fontSize: 13, whiteSpace: 'pre-wrap' }}>{field.value || 'Value'}</div>
                </div>
              ))}
              {data.footer?.text ? <div style={{ color: '#949ba4', fontSize: 12 }}>{data.footer.text}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmbedStudio({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [content, setContent] = useState('');
  const [embed, setEmbed] = useState(DEFAULT_EMBED);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const presetList = useMemo(() => Object.values(presets || {}).filter(Boolean), [presets]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getEmbedStudio(guildId);
      const draft = result.builder?.draft || result.draft || {};
      setContent(draft.content || '');
      setEmbed(normalizeEmbed(draft.embed || draft));
      setPresets(result.presets || {});
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Embed Studio.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  function updateEmbed(path, value) {
    setEmbed((current) => {
      const next = normalizeEmbed(current);
      if (path.includes('.')) {
        const [group, key] = path.split('.');
        next[group] = { ...(next[group] || {}), [key]: value };
      } else {
        next[path] = value;
      }
      return next;
    });
  }

  function addField() {
    setEmbed((current) => ({ ...normalizeEmbed(current), fields: [...(current.fields || []), { name: 'New Field', value: 'Field value', inline: false }] }));
  }

  function updateField(index, key, value) {
    setEmbed((current) => {
      const next = normalizeEmbed(current);
      next.fields = next.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, [key]: value } : field));
      return next;
    });
  }

  function removeField(index) {
    setEmbed((current) => ({ ...normalizeEmbed(current), fields: (current.fields || []).filter((_, fieldIndex) => fieldIndex !== index) }));
  }

  async function saveDraft() {
    if (!guildId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.saveEmbedDraft(guildId, { content, embed });
      setNotice('Embed draft saved.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save embed draft.');
    } finally {
      setSaving(false);
    }
  }

  async function savePreset() {
    if (!guildId || !presetName.trim()) {
      setError('Enter a preset name before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api.saveEmbedPreset(guildId, presetName.trim(), { content, embed });
      setPresets(result.presets || { ...(presets || {}), [presetName.trim()]: result.preset });
      setNotice('Preset saved.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save preset.');
    } finally {
      setSaving(false);
    }
  }

  function loadPreset(name) {
    const preset = presets?.[name];
    if (!preset) return;
    setPresetName(name);
    setContent(preset.content || '');
    setEmbed(normalizeEmbed(preset.embed || preset));
  }

  if (!guildId) {
    return <PageShell title="Embed Studio" subtitle="Select a server to build embeds." theme={theme}><EmptyState theme={theme} text="Select a server to manage Embed Studio." /></PageShell>;
  }

  return (
    <PageShell title="Embed Studio" subtitle="Build, preview and save Discord embeds from the dashboard." theme={theme} guild={{ id: guildId, name: 'Embed Studio' }} actions={<SecondaryButton theme={theme} onClick={saveDraft} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</SecondaryButton>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading Embed Studio..." /> : null}
      {!loading ? (
        <>
          <StatGrid min="min(220px, 100%)">
            <SummaryStat theme={theme} label="Presets" value={presetList.length} accent="#3b82f6" description="Stored in guild JSON" />
            <SummaryStat theme={theme} label="Fields" value={(embed.fields || []).length} accent="#22c55e" description="Current embed fields" />
            <SummaryStat theme={theme} label="Buttons" value={(embed.buttons || []).length} accent="#f59e0b" description="Current action buttons" />
          </StatGrid>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(320px, 0.95fr)', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 18 }}>
              <SectionCard theme={theme} title="Preset Manager" subtitle="Save and load embed presets.">
                <div style={{ display: 'grid', gap: 12 }}>
                  <TextField theme={theme} label="Preset Name" value={presetName} onChange={setPresetName} placeholder="Server Rules" />
                  <select value="" onChange={(event) => loadPreset(event.target.value)} style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.55)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 800 }}>
                    <option value="">Load preset...</option>
                    {presetList.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
                  </select>
                  <SecondaryButton theme={theme} onClick={savePreset} disabled={saving}>Save Preset</SecondaryButton>
                </div>
              </SectionCard>
              <SectionCard theme={theme} title="Message Content" subtitle="Optional content above the embed.">
                <TextField theme={theme} label="Content" value={content} onChange={setContent} multiline placeholder="Write message content..." />
              </SectionCard>
              <SectionCard theme={theme} title="Embed Body" subtitle="Core embed content.">
                <div style={{ display: 'grid', gap: 12 }}>
                  <TextField theme={theme} label="Author Name" value={embed.author?.name} onChange={(value) => updateEmbed('author.name', value)} placeholder="Author" />
                  <TextField theme={theme} label="Title" value={embed.title} onChange={(value) => updateEmbed('title', value)} placeholder="Embed title" />
                  <TextField theme={theme} label="Description" value={embed.description} onChange={(value) => updateEmbed('description', value)} multiline placeholder="Embed description" />
                  <TextField theme={theme} label="Colour" value={embed.color} onChange={(value) => updateEmbed('color', value)} placeholder="#5865F2" />
                </div>
              </SectionCard>
              <SectionCard theme={theme} title="Media & Footer" subtitle="Thumbnail, image and footer.">
                <div style={{ display: 'grid', gap: 12 }}>
                  <TextField theme={theme} label="Thumbnail URL" value={embed.thumbnailURL} onChange={(value) => updateEmbed('thumbnailURL', value)} placeholder="https://..." />
                  <TextField theme={theme} label="Image URL" value={embed.imageURL} onChange={(value) => updateEmbed('imageURL', value)} placeholder="https://..." />
                  <TextField theme={theme} label="Footer Text" value={embed.footer?.text} onChange={(value) => updateEmbed('footer.text', value)} placeholder="Footer" />
                </div>
              </SectionCard>
              <SectionCard theme={theme} title="Fields" subtitle="Add Discord embed fields." actions={<SecondaryButton theme={theme} onClick={addField}>Add Field</SecondaryButton>}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {(embed.fields || []).map((field, index) => (
                    <div key={index} style={{ display: 'grid', gap: 10, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 12, background: theme.softBg }}>
                      <TextField theme={theme} label="Field Name" value={field.name} onChange={(value) => updateField(index, 'name', value)} />
                      <TextField theme={theme} label="Field Value" value={field.value} onChange={(value) => updateField(index, 'value', value)} multiline />
                      <SecondaryButton theme={theme} onClick={() => removeField(index)}>Remove Field</SecondaryButton>
                    </div>
                  ))}
                  {(embed.fields || []).length === 0 ? <EmptyState theme={theme} text="No fields added yet." /> : null}
                </div>
              </SectionCard>
            </div>
            <SectionCard theme={theme} title="Live Preview" subtitle="Preview updates as you type.">
              <Preview theme={theme} content={content} embed={embed} />
            </SectionCard>
          </div>
        </>
      ) : null}
    </PageShell>
  );
}
