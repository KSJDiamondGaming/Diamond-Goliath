import React from 'react';

function getResourceLabel(item, fallback = 'Unnamed') {
  return item?.name || item?.label || item?.id || fallback;
}

export function DiscordResourceSelect({
  theme,
  label,
  value,
  onChange,
  resources = [],
  placeholder = 'Choose an option',
  disabled = false,
}) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <select
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.55)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 800 }}
      >
        <option value="">{placeholder}</option>
        {resources.map((item) => (
          <option key={item.id} value={item.id}>{getResourceLabel(item)}</option>
        ))}
      </select>
    </label>
  );
}

export function ChannelSelect(props) {
  return <DiscordResourceSelect {...props} label={props.label || 'Channel'} placeholder={props.placeholder || 'Choose a channel'} />;
}

export function RoleSelect(props) {
  return <DiscordResourceSelect {...props} label={props.label || 'Role'} placeholder={props.placeholder || 'Choose a role'} />;
}

export function CategorySelect(props) {
  return <DiscordResourceSelect {...props} label={props.label || 'Category'} placeholder={props.placeholder || 'Choose a category'} />;
}

export function EmojiSelect(props) {
  return <DiscordResourceSelect {...props} label={props.label || 'Emoji'} placeholder={props.placeholder || 'Choose an emoji'} />;
}

export default DiscordResourceSelect;
