import React, { memo, useEffect, useMemo, useState } from 'react';
import { botAvatarStyles } from "../ui/components";

function getNameInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || 'K';
}

function buildDiscordAvatarUrl(botData) {
  if (!botData) return '';

  if (botData.avatarUrl) return botData.avatarUrl;
  if (botData.avatarURL) return botData.avatarURL;
  if (botData.image) return botData.image;
  if (botData.profileImage) return botData.profileImage;

  const id = botData.id || botData.botId || '';
  const avatar = botData.avatar || botData.avatarHash || '';

  if (!id || !avatar) return '';

  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=256`;
}

function BotAvatar({ theme, botAvatar, botName, botData, expanded = true }) {
  const styles = useMemo(() => botAvatarStyles(theme), [theme]);
  const displayName = botName || 'Goliath';
  const initial = useMemo(() => getNameInitial(displayName), [displayName]);

  const propImage = botAvatar || '';
  const fallbackImage = useMemo(() => buildDiscordAvatarUrl(botData), [botData]);

  const [imageSrc, setImageSrc] = useState(propImage || fallbackImage || '');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setImageSrc(propImage || fallbackImage || '');
  }, [propImage, fallbackImage]);

  const handleImageError = () => {
    if (imageSrc !== fallbackImage && fallbackImage) {
      setImageSrc(fallbackImage);
      return;
    }

    setImageFailed(true);
  };

  const shouldShowImage = Boolean(imageSrc) && !imageFailed;

  return (
    <div style={styles.wrap(expanded)} title={displayName} aria-label={displayName}>
      {shouldShowImage ? (
        <img
          src={imageSrc}
          alt={displayName}
          style={styles.avatar}
          onError={handleImageError}
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