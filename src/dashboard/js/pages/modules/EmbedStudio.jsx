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

const BUTTON_STYLES = ['Primary', 'Secondary', 'Success', 'Danger', 'Link'];

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

function normalizePresets(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload || {})
      .filter(([key, value]) => key !== 'updatedAt' && value && typeof value === 'object')
      .map(([key, value]) => [key, { ...value, name: value.name || key }])
  );
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
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

function SelectField({ theme, label, value, onChange, children }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.55)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 800, outline: 'none' }}>
        {children}
      </select>
    </label>
  );
}

function Pill({ theme, children, tone = 'info' }) {
  const tones = {
    info: { bg: theme.softBg, border: theme.cardBorder, text: theme.mutedText },
    active: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)', text: '#86efac' },
    danger: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.28)', text: '#fca5a5' },
  };
  const current = tones[tone] || tones.info;
  return <span style={{ border: `1px solid ${current.border}`, background: current.bg, color: current.text, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</span>;
}

function Preview({ theme, content, embed }) {
  const data = normalizeEmbed(embed);
  const buttonRows = [];
  for (let i = 0; i < (data.buttons || []).length; i += 5) {
    buttonRows.push(data.buttons.slice(i, i + 5));
  }

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: '#313338', color: '#dbdee1', borderRadius: 18, padding: 18, display: 'grid', gap: 12, position: 'sticky', top: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#5865F2,#22c55e)', flex: '0 0 auto' }} />
        <div style={{ minWidth: 0, width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: '#fff' }}>Goliath</strong>
            <span style={{ color: '#fff', background: '#5865F2', borderRadius: 4, padding: '1px 4px', fontSize: 10, fontWeight: 900 }}>BOT</span>
            <span style={{ color: '#949ba4', fontSize: 12 }}>Today at 12:00</span>
          </div>
          {content ? <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{content}</div> : null}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '4px 1fr', borderRadius: 6, overflow: 'hidden', background: '#2b2d31', maxWidth: 620 }}>
            <div style={{ background: data.color || '#5865F2' }} />
            <div style={{ padding: 14, display: 'grid', gap: 8 }}>
              {data.author?.name ? <div style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{data.author.name}</div> : null}
              {data.title ? <div style={{ color: '#00a8fc', fontWeight: 800 }}>{data.title}</div> : null}
              {data.description ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{data.description}</div> : null}
              {(data.fields || []).length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  {(data.fields || []).map((field, index) => (
                    <div key={`${field.name}-${index}`}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>{field.name || 'Field'}</div>
                      <div style={{ color: '#dbdee1', fontSize: 13, whiteSpace: 'pre-wrap' }}>{field.value || 'Value'}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {data.thumbnailURL ? <div style={{ color: '#93c5fd', fontSize: 12, overflowWrap: 'anywhere' }}>Thumbnail: {data.thumbnailURL}</div> : null}
              {data.imageURL ? <div style={{ color: '#93c5fd', fontSize: 12, overflowWrap: 'anywhere' }}>Image: {data.imageURL}</div> : null}
              {data.footer?.text ? <div style={{ color: '#949ba4', fontSize: 12 }}>{data.footer.text}</div> : null}
            </div>
          </div>
          {buttonRows.length ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {buttonRows.map((row, rowIndex) => (
                <div key={rowIndex} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {row.map((button, index) => (
                    <span key={`${button.label}-${index}`} style={{ background: button.style === 'Danger' ? '#da373c' : button.style === 'Success' ? '#248046' : button.style === 'Secondary' ? '#4e5058' : '#5865F2', color: '#fff', borderRadius: 4, padding: '7px 12px', fontSize: 13, fontWeight: 800 }}>
                      {button.emoji ? `${button.emoji} ` : ''}{button.label || 'Button'}{button.style === 'Link' ? ' ↗' : ''}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
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
  const [deployments, setDeployments] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const presetList = useMemo(() => Object.values(presets || {}).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name))), [presets]);
  const deploymentList = useMemo(() => Object.values(deployments || {}).filter(Boolean).sort((a, b) => String(b.lastUpdatedAt || '').localeCompare(String(a.lastUpdatedAt || ''))), [deployments]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getEmbedStudio(guildId);
      const draft = result.builder?.draft || result.draft || {};
      setContent(draft.content || '');
      setEmbed(normalizeEmbed(draft.embed || draft));
      setPresets(normalizePresets(result.presets || {}));
      setDeployments(result.builder?.deployments || {});
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

  function addButton() {
    setEmbed((current) => {
      const safe = normalizeEmbed(current);
      if ((safe.buttons || []).length >= 20) return safe;
      return { ...safe, buttons: [...safe.buttons, { label: 'Button', emoji: '', style: 'Link', url: '', action: 'link' }] };
    });
  }

  function updateButton(index, key, value) {
    setEmbed((current) => {
      const safe = normalizeEmbed(current);
      safe.buttons = safe.buttons.map((button, buttonIndex) => buttonIndex === index ? { ...button, [key]: value } : button);
      return safe;
    });
  }

  function removeButton(index) {
    setEmbed((current) => ({ ...normalizeEmbed(current), buttons: (current.buttons || []).filter((_, buttonIndex) => buttonIndex !== index) }));
  }

  async function saveDraft() {
    if (!guildId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.saveEmbedDraft(guildId, { content, embed });
      setNotice('Embed draft saved to modules.embedBuilder.draft.');
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
      setPresets(normalizePresets(result.presets || { ...(presets || {}), [presetName.trim()]: result.preset }));
      setNotice('Preset saved to modules.embedPresets.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save preset.');
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset(name) {
    if (!guildId || !name) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api.deleteEmbedPreset(guildId, name);
      setPresets(normalizePresets(result.presets || {}));
      if (presetName === name) setPresetName('');
      setNotice('Preset deleted from modules.embedPresets.');
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete preset.');
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
    <PageShell title="Embed Studio" subtitle="Dashboard editor synced with the Discord embed panel through the single guild JSON." theme={theme} guild={{ id: guildId, name: 'Embed Studio' }} actions={<SecondaryButton theme={theme} onClick={saveDraft} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</SecondaryButton>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading Embed Studio..." /> : null}
      {!loading ? (
        <>
          <StatGrid min="min(190px, 100%)">
            <SummaryStat theme={theme} label="Presets" value={presetList.length} accent="#3b82f6" description="modules.embedPresets" />
            <SummaryStat theme={theme} label="Deployments" value={deploymentList.length} accent="#a855f7" description="modules.embedBuilder.deployments" />
            <SummaryStat theme={theme} label="Fields" value={(embed.fields || []).length} accent="#22c55e" description="Current embed fields" />
            <SummaryStat theme={theme} label="Buttons" value={(embed.buttons || []).length} accent="#f59e0b" description="Current action buttons" />
          </StatGrid>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(340px, 0.92fr)', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 18 }}>
              <SectionCard theme={theme} title="Preset Manager" subtitle="Presets are shared with the Discord embed panel.">
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 0.7fr)', gap: 12 }}>
                  <TextField theme={theme} label="Preset Name" value={presetName} onChange={setPresetName} placeholder="Server Rules" />
                  <SelectField theme={theme} label="Load Preset" value="" onChange={loadPreset}>
                    <option value="">Choose...</option>
                    {presetList.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
                  </SelectField>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <SecondaryButton theme={theme} onClick={savePreset} disabled={saving}>Save Preset</SecondaryButton>
                  <SecondaryButton theme={theme} onClick={() => load()} disabled={saving}>Reload From JSON</SecondaryButton>
                </div>
              </SectionCard>

              <SectionCard theme={theme} title="Message & Embed" subtitle="Edit the same data shape used by the Discord embed panel.">
                <div style={{ display: 'grid', gap: 12 }}>
                  <TextField theme={theme} label="Message Content" value={content} onChange={setContent} multiline placeholder="Optional message above the embed..." />
                  <TextField theme={theme} label="Author Name" value={embed.author?.name} onChange={(value) => updateEmbed('author.name', value)} placeholder="Author" />
                  <TextField theme={theme} label="Title" value={embed.title} onChange={(value) => updateEmbed('title', value)} placeholder="Embed title" />
                  <TextField theme={theme} label="Description" value={embed.description} onChange={(value) => updateEmbed('description', value)} multiline placeholder="Embed description" />
                  <TextField theme={theme} label="Colour" value={embed.color} onChange={(value) => updateEmbed('color', value)} placeholder="#5865F2" />
                </div>
              </SectionCard>

              <SectionCard theme={theme} title="Media & Footer" subtitle="Supports URLs and Goliath variables like {guildIcon}.">
                <div style={{ display: 'grid', gap: 12 }}>
                  <TextField theme={theme} label="Thumbnail URL" value={embed.thumbnailURL} onChange={(value) => updateEmbed('thumbnailURL', value)} placeholder="https://... or {guildIcon}" />
                  <TextField theme={theme} label="Image URL" value={embed.imageURL} onChange={(value) => updateEmbed('imageURL', value)} placeholder="https://... or {guildBanner}" />
                  <TextField theme={theme} label="Footer Text" value={embed.footer?.text} onChange={(value) => updateEmbed('footer.text', value)} placeholder="Footer" />
                  <TextField theme={theme} label="Footer Icon URL" value={embed.footer?.iconURL} onChange={(value) => updateEmbed('footer.iconURL', value)} placeholder="https://... or {guildIcon}" />
                </div>
              </SectionCard>

              <SectionCard theme={theme} title="Fields" subtitle="Add up to 25 Discord embed fields." actions={<SecondaryButton theme={theme} onClick={addField}>Add Field</SecondaryButton>}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {(embed.fields || []).map((field, index) => (
                    <div key={index} style={{ display: 'grid', gap: 10, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 12, background: theme.softBg }}>
                      <TextField theme={theme} label={`Field ${index + 1} Name`} value={field.name} onChange={(value) => updateField(index, 'name', value)} />
                      <TextField theme={theme} label="Field Value" value={field.value} onChange={(value) => updateField(index, 'value', value)} multiline />
                      <SelectField theme={theme} label="Inline" value={field.inline ? 'yes' : 'no'} onChange={(value) => updateField(index, 'inline', value === 'yes')}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </SelectField>
                      <SecondaryButton theme={theme} onClick={() => removeField(index)}>Remove Field</SecondaryButton>
                    </div>
                  ))}
                  {(embed.fields || []).length === 0 ? <EmptyState theme={theme} text="No fields added yet." /> : null}
                </div>
              </SectionCard>

              <SectionCard theme={theme} title="Buttons" subtitle="Build link/action buttons. Discord limit is 20 buttons." actions={<SecondaryButton theme={theme} onClick={addButton} disabled={(embed.buttons || []).length >= 20}>Add Button</SecondaryButton>}>
                <div style={{ display: 'grid', gap: 12 }}>
                  {(embed.buttons || []).map((button, index) => (
                    <div key={index} style={{ display: 'grid', gap: 10, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 12, background: theme.softBg }}>
                      <TextField theme={theme} label={`Button ${index + 1} Label`} value={button.label} onChange={(value) => updateButton(index, 'label', value)} />
                      <TextField theme={theme} label="Emoji" value={button.emoji} onChange={(value) => updateButton(index, 'emoji', value)} placeholder="Optional" />
                      <SelectField theme={theme} label="Style" value={button.style || 'Link'} onChange={(value) => updateButton(index, 'style', value)}>
                        {BUTTON_STYLES.map((style) => <option key={style} value={style}>{style}</option>)}
                      </SelectField>
                      <TextField theme={theme} label="URL" value={button.url} onChange={(value) => updateButton(index, 'url', value)} placeholder="Required for Link buttons" />
                      <SecondaryButton theme={theme} onClick={() => removeButton(index)}>Remove Button</SecondaryButton>
                    </div>
                  ))}
                  {(embed.buttons || []).length === 0 ? <EmptyState theme={theme} text="No buttons added yet." /> : null}
                </div>
              </SectionCard>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <SectionCard theme={theme} title="Live Discord Preview" subtitle="Preview updates as you type.">
                <Preview theme={theme} content={content} embed={embed} />
              </SectionCard>

              <SectionCard theme={theme} title="Saved Presets" subtitle="These are visible to the Discord embed panel.">
                <div style={{ display: 'grid', gap: 10 }}>
                  {presetList.map((preset) => (
                    <div key={preset.name} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, borderRadius: 14, padding: 12, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <strong style={{ color: theme.cardText }}>{preset.name}</strong>
                        <Pill theme={theme}>{preset.template || 'custom'}</Pill>
                      </div>
                      <div style={{ color: theme.mutedText, fontSize: 13, overflowWrap: 'anywhere' }}>{preset.title || preset.embed?.title || 'Untitled embed'}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <SecondaryButton theme={theme} onClick={() => loadPreset(preset.name)}>Load</SecondaryButton>
                        <SecondaryButton theme={theme} onClick={() => deletePreset(preset.name)} disabled={saving}>Delete</SecondaryButton>
                      </div>
                    </div>
                  ))}
                  {presetList.length === 0 ? <EmptyState theme={theme} text="No presets saved yet." /> : null}
                </div>
              </SectionCard>

              <SectionCard theme={theme} title="Deployments" subtitle="Tracked posted embeds from Discord or dashboard.">
                <div style={{ display: 'grid', gap: 10 }}>
                  {deploymentList.map((deployment) => (
                    <div key={deployment.key} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, borderRadius: 14, padding: 12, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <strong style={{ color: theme.cardText }}>{deployment.key}</strong>
                        <Pill theme={theme} tone={deployment.status === 'active' ? 'active' : 'danger'}>{deployment.status || 'unknown'}</Pill>
                      </div>
                      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>
                        <div>Channel: {deployment.channelId || 'Unknown'}</div>
                        <div>Message: {deployment.messageId || 'Unknown'}</div>
                        <div>Updated: {formatDate(deployment.lastUpdatedAt)}</div>
                      </div>
                    </div>
                  ))}
                  {deploymentList.length === 0 ? <EmptyState theme={theme} text="No deployed embeds tracked yet. Use the Discord panel or a future dashboard deploy action." /> : null}
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      ) : null}
    </PageShell>
  );
}
