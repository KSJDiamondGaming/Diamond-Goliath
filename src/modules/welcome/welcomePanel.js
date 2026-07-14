'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const welcome = require('./welcome');
const { buildPreviewEmbeds } = require('../embed/embedPanel');
const embedTemplateManager = require('../embed/embedTemplateManager');

const selections = new Map();

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function selectionKey(interactionOrGuild, userId = 'panel') {
  const guildId = interactionOrGuild?.guild?.id || interactionOrGuild?.id;
  const resolvedUserId = interactionOrGuild?.user?.id || userId;
  return `${guildId}:${resolvedUserId}`;
}

function templateTypeLabel(template = {}) {
  const type = String(template.templateType || template.module || 'global');
  return type === 'global' ? 'General' : type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function getTemplateOptions(guildId) {
  return Object.values(embedTemplateManager.listTemplates(guildId))
    .filter(Boolean)
    .sort((a, b) => {
      const aWelcome = a.templateType === 'welcome' || a.module === 'welcome' ? 0 : 1;
      const bWelcome = b.templateType === 'welcome' || b.module === 'welcome' ? 0 : 1;
      return aWelcome - bWelcome || String(a.name || a.templateId).localeCompare(String(b.name || b.templateId));
    })
    .slice(0, 25)
    .map((template) => ({
      label: String(template.name || template.templateId).slice(0, 100),
      description: `${templateTypeLabel(template)} · ${template.embed?.title || template.panels?.[0]?.title || 'Embed Studio template'}`.slice(0, 100),
      value: String(template.templateId),
    }));
}

function selectedTemplateId(guild, activeTemplateId, userId = 'panel') {
  return selections.get(`${guild.id}:${userId}`) || activeTemplateId || null;
}

function templateMenu(guild, activeTemplateId, userId) {
  const options = getTemplateOptions(guild.id);
  const selected = selectedTemplateId(guild, activeTemplateId, userId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('admin:welcome:template')
    .setPlaceholder(options.length ? 'Choose an Embed Studio template' : 'No templates available')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(options.length === 0);

  if (options.length) {
    menu.addOptions(options.map((option) => ({
      ...option,
      default: option.value === selected,
    })));
  } else {
    menu.addOptions({ label: 'No templates found', value: 'none' });
  }

  return menu;
}

function templatePreviewState(template = {}) {
  const panels = Array.isArray(template.panels) && template.panels.length
    ? template.panels
    : [{
      title: template.embed?.title || '',
      description: template.embed?.description || '',
      color: template.embed?.color || '#5865F2',
      authorName: template.embed?.author?.name || '',
      authorIcon: template.embed?.author?.iconURL || '',
      authorUrl: template.embed?.author?.url || '',
      thumbnail: template.embed?.thumbnailURL || '',
      image: template.embed?.imageURL || '',
      footer: template.embed?.footer?.text || '',
      footerIcon: template.embed?.footer?.iconURL || '',
      fields: Array.isArray(template.embed?.fields) ? template.embed.fields : [],
    }];

  return {
    ...template,
    panels,
    selectedPanelIndex: 0,
    buttons: Array.isArray(template.buttons) ? template.buttons : (template.embed?.buttons || []),
    showTimestamp: template.showTimestamp !== false,
    fieldLayout: template.fieldLayout || 'auto',
    allowUserPing: false,
  };
}

async function buildWelcomePanel(guild, memberDisplayName = 'Unknown User', userId = 'panel') {
  const config = welcome.getWelcomeSection(guild.id);
  const health = await welcome.buildHealthReport(guild);
  const analytics = config.analytics || {};
  const binding = welcome.getWelcomeBinding(guild.id, 'welcome');
  const activeTemplateId = binding?.templateId || config.templateId;
  const activeTemplate = binding || embedTemplateManager.getTemplate(guild.id, activeTemplateId);
  const stagedTemplateId = selections.get(`${guild.id}:${userId}`);
  const stagedTemplate = stagedTemplateId ? embedTemplateManager.getTemplate(guild.id, stagedTemplateId) : null;
  const warnings = health.warnings.filter((warning) => !warning.startsWith('No Embed Studio template is explicitly bound'));

  const embed = new EmbedBuilder()
    .setColor(warnings.length ? 0xfaa61a : 0x57f287)
    .setTitle('👋 Welcome · Setup')
    .setDescription([
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Welcome Channel:** ${config.channelId ? `<#${config.channelId}>` : '`Not set`'}`,
      `**Welcome DM:** ${config.dmEnabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Ping New Member:** ${config.allowUserPing ? 'Yes ✅' : 'No ❌'}`,
      `**Ignore Bots:** ${config.ignoreBots ? 'Yes ✅' : 'No ❌'}`,
      '',
      '**📨 Current Welcome Message**',
      `**Name:** ${activeTemplate ? `\`${activeTemplate.name || activeTemplate.templateId}\`` : '`Not set`'}`,
      `**Template:** ${activeTemplate ? `\`${activeTemplate.templateId}\`` : '`Not set`'}`,
      `**Assignment:** ${binding ? 'Assigned ✅' : 'Using configured default'}`,
      '**Source:** Embed Studio',
      stagedTemplate ? `**Selected:** \`${stagedTemplate.name || stagedTemplate.templateId}\` · press **Assign**` : null,
      '',
      `Public sent: \`${analytics.publicSent || 0}\` | DMs sent: \`${analytics.dmSent || 0}\` | Failed: \`${(analytics.publicFailed || 0) + (analytics.dmFailed || 0)}\``,
      '',
      warnings.length ? `**Warnings**\n${warnings.map((warning) => `• ${warning}`).join('\n')}` : '**Health:** Healthy ✅',
    ].filter(Boolean).join('\n').slice(0, 4096))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:welcome:channel')
        .setPlaceholder('Select the public welcome channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)),
      row(templateMenu(guild, activeTemplateId, userId)),
      row(
        button(config.enabled ? 'admin:welcome:disable' : 'admin:welcome:enable', config.enabled ? '⏸ Disable' : '▶ Enable', config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:welcome:toggleDm', config.dmEnabled ? '📨 No DM' : '📨 DM'),
        button('admin:welcome:togglePing', config.allowUserPing ? '🔕 No Ping' : '🔔 Ping'),
        button('admin:welcome:toggleBots', config.ignoreBots ? '🤖 Bots' : '🤖 Ignore')
      ),
      row(
        button('admin:welcome:assign', '✅ Assign', ButtonStyle.Primary),
        button('admin:welcome:test', '🧪 Test', ButtonStyle.Success),
        button('admin:welcome:repair', '🩺 Repair'),
        button('admin:welcome:reset', '♻ Reset', ButtonStyle.Danger),
        button('admin:modules', '⬅ Modules')
      ),
    ],
  };
}

async function updatePanel(interaction) {
  const payload = await buildWelcomePanel(
    interaction.guild,
    interaction.member?.displayName || interaction.user?.username,
    interaction.user.id
  );
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

async function handleWelcomeInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:welcome')) return false;

  try {
    if (customId === 'admin:welcome') return updatePanel(interaction);

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:welcome:channel') {
      welcome.updateConfig(interaction.guild.id, { channelId: interaction.values?.[0] || null }, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (interaction.isStringSelectMenu?.() && customId === 'admin:welcome:template') {
      const templateId = interaction.values?.[0];
      if (!templateId || templateId === 'none' || !embedTemplateManager.getTemplate(interaction.guild.id, templateId)) {
        throw new Error('Choose a valid Embed Studio template.');
      }
      selections.set(selectionKey(interaction), templateId);
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:assign') {
      const templateId = selections.get(selectionKey(interaction));
      if (!templateId) throw new Error('Choose a template first.');
      welcome.bindWelcomeTemplate(interaction.guild.id, templateId, 'welcome', { actorId: interaction.user.id });
      welcome.updateConfig(interaction.guild.id, { templateId, presetName: null }, { action: 'welcome_template_assign', actorId: interaction.user.id });
      selections.delete(selectionKey(interaction));
      return updatePanel(interaction);
    }

    const config = welcome.getWelcomeSection(interaction.guild.id);
    if (customId === 'admin:welcome:enable') welcome.updateConfig(interaction.guild.id, { enabled: true }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:disable') welcome.updateConfig(interaction.guild.id, { enabled: false }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleDm') welcome.updateConfig(interaction.guild.id, { dmEnabled: !config.dmEnabled }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:togglePing') welcome.updateConfig(interaction.guild.id, { allowUserPing: !config.allowUserPing }, { actorId: interaction.user.id });
    if (customId === 'admin:welcome:toggleBots') welcome.updateConfig(interaction.guild.id, { ignoreBots: !config.ignoreBots }, { actorId: interaction.user.id });

    if (customId === 'admin:welcome:test') {
      const assigned = welcome.getWelcomeBinding(interaction.guild.id, 'welcome')
        || embedTemplateManager.getTemplate(interaction.guild.id, welcome.getWelcomeSection(interaction.guild.id).templateId);
      if (!assigned) throw new Error('Assign an Embed Studio template first.');
      const state = templatePreviewState(assigned);
      return interaction.reply({
        content: assigned.content || '',
        embeds: buildPreviewEmbeds(state, interaction),
        allowedMentions: { parse: [], repliedUser: false },
        ephemeral: true,
      });
    }

    if (customId === 'admin:welcome:repair') {
      await interaction.deferUpdate();
      await welcome.repairConfiguration(interaction.guild, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:reset') {
      await interaction.deferUpdate();
      selections.delete(selectionKey(interaction));
      welcome.resetWelcome(interaction.guild.id, { actorId: interaction.user.id });
      return updatePanel(interaction);
    }

    if (customId === 'admin:welcome:export') {
      const attachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(welcome.exportConfiguration(interaction.guild.id), null, 2), 'utf8'),
        { name: `goliath-welcome-${interaction.guild.id}.json` }
      );
      await interaction.reply({ content: '📤 Welcome configuration export.', files: [attachment], ephemeral: true });
      return true;
    }

    return updatePanel(interaction);
  } catch (error) {
    const payload = { content: `❌ Welcome setup failed: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildWelcomePanel,
  handleWelcomeInteraction,
  buildWelcomeAdminPanel: buildWelcomePanel,
  handleWelcomeAdminInteraction: handleWelcomeInteraction,
};
