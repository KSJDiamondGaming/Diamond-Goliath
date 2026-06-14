import { useCallback, useEffect, useState } from 'react';

import { api } from '../services/apiClient.js';
import { getStorage, setStorage } from '../storage.js';

const BOT_PROFILE_STORAGE_KEY = 'bot_profile';

function buildDiscordAvatarUrl(entity) {
  if (!entity) return '';

  if (entity.avatarUrl) return entity.avatarUrl;
  if (entity.avatarURL) return entity.avatarURL;
  if (entity.image) return entity.image;
  if (entity.profileImage) return entity.profileImage;

  const id = entity.id || entity.botId || '';
  const avatar = entity.avatar || entity.avatarHash || '';

  if (!id || !avatar || typeof avatar !== 'string') {
    return '';
  }

  const ext = avatar.startsWith('a_') ? 'gif' : 'png';

  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=256`;
}

function normalizeBotProfile(payload) {
  const bot =
    payload?.bot ||
    payload?.data?.bot ||
    payload?.botData ||
    payload ||
    null;

  if (!bot || typeof bot !== 'object') {
    return {
      name: 'Goliath',
      avatar: '',
      raw: null,
    };
  }

  return {
    name:
      bot.name ||
      bot.username ||
      bot.displayName ||
      bot.global_name ||
      bot.globalName ||
      'Goliath',

    avatar:
      bot.avatarUrl ||
      bot.avatarURL ||
      buildDiscordAvatarUrl(bot) ||
      '',

    raw: bot,
  };
}

export function useBotStatus() {
  const cachedBotProfile = getStorage(BOT_PROFILE_STORAGE_KEY, {
    name: 'Goliath',
    avatar: '',
    raw: null,
  });

  const [botName, setBotName] = useState(
    cachedBotProfile?.name || 'Goliath'
  );

  const [botAvatar, setBotAvatar] = useState(
    cachedBotProfile?.avatar || ''
  );

  const [botData, setBotData] = useState(
    cachedBotProfile?.raw || null
  );

  const applyBotProfile = useCallback((profile) => {
    const safeProfile = {
      name: profile?.name || 'Goliath',
      avatar: profile?.avatar || '',
      raw: profile?.raw || null,
    };

    setBotName(safeProfile.name);
    setBotAvatar(safeProfile.avatar);
    setBotData(safeProfile.raw);

    setStorage(BOT_PROFILE_STORAGE_KEY, safeProfile);
  }, []);

  const refreshBotStatus = useCallback(async ({ force = false } = {}) => {
    try {
      const status = await api.getStatus(undefined, { force });

      const nextProfile = normalizeBotProfile(
        status?.bot || status
      );

      applyBotProfile(nextProfile);

      return nextProfile;
    } catch (error) {
      console.error('Failed to load bot status:', error);

      return null;
    }
  }, [applyBotProfile]);

  useEffect(() => {
    refreshBotStatus();
  }, [refreshBotStatus]);

  return {
    botName,
    botAvatar,
    botData,
    refreshBotStatus,
    applyBotProfile,
  };
}