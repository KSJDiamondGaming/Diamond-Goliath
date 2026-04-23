import { memo, useEffect, useMemo, useState } from 'react';
import { botAvatarStyles } from '../ui';

function getNameInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || 'K';
}

function buildDiscordAvatarUrl(botData) {
  if (!botData) return '';

  const id = botData.id || botData.botId || '';
  const avatar = botData.avatar || botData.avatarHash || '';

  if (!id || !avatar) return '';

  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=256`;
}

function BotAvatar({ theme, botAvatar, botName, botData, expanded = true }) {
  const styles = useMemo(() => botAvatarStyles(theme), [theme]);
  const displayName = botName || 'KSJ Goliath';
  const initial = useMemo(() => getNameInitial(displayName), [displayName]);

  const [imageSrc, setImageSrc] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);

    if (botAvatar) {
      setImageSrc(botAvatar);
      return;
    }

    const discordAvatar = buildDiscordAvatarUrl(botData);
    if (discordAvatar) {
      setImageSrc(discordAvatar);
      return;
    }

    setImageSrc('');
  }, [botAvatar, botData]);

  const shouldShowImage = Boolean(imageSrc) && !imageFailed;

  return (
    <div style={styles.wrap(expanded)} title={displayName} aria-label={displayName}>
      {shouldShowImage ? (
        <img
          src={imageSrc}
          alt={displayName}
          style={styles.avatar}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div style={styles.fallback} aria-hidden="true">
          {initial}
        </div>
      )}

      {expanded ? <div style={styles.label}>{displayName}</div> : null}
    </div>
  );
}

export default memo(BotAvatar);