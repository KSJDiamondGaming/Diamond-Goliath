'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const colourRoles = require('./colourRoles');
const healthService = require('./colourRolesHealth');

function row(...items) { return new ActionRowBuilder().addComponents(...items.filter(Boolean)); }
function button(id, label, style = ButtonStyle.Secondary) { return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style); }
function displayName(interaction) { return interaction.member?.displayName || interaction.user?.username || 'Unknown User'; }
async function update(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

function paletteOptions(section) {
  return section.palette.filter((item) => item.enabled).slice(0, 24).map((item) => ({
    label: item.label.slice(0, 100), value: item.hex, emoji: item.emoji || undefined,
    description: `${item.hex} · ${item.family}`.slice(0, 100),
  }));
}

function buildMemberPayload(guild) {
  const section = colourRoles.getSection(guild.id);
  const options = paletteOptions(section);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌈 Choose Your Colour')
    .setDescription([
      'Choose a colour for your Discord name. You can switch whenever you like.',
      section.customHexEnabled ? 'Use **Pick Your Own** for a custom HEX colour.' : null,
      section.allowRemoveColour ? 'Use **Remove My Colour** to clear your Colour Role.' : null,
    ].filter(Boolean).join('\n'));
  return {
    embeds: [embed],
    components: [
      row(new StringSelectMenuBuilder().setCustomId('colourRoles:choose').setPlaceholder('🌈 Choose a colour').setMinValues(1).setMaxValues(1).addOptions(options)),
      row(
        section.customHexEnabled ? button('colourRoles:custom', '🎨 Pick Your Own', ButtonStyle.Primary) : null,
        section.allowRemoveColour ? button('colourRoles:remove', '🧹 Remove My Colour', ButtonStyle.Secondary) : null,
      ),
    ].filter((actionRow) => actionRow.components.length),
  };
}

async function buildAdminPanel(guild, requestedBy = 'Unknown User') {
  const section = colourRoles.getSection(guild.id);
  const enabled = guildManager.isModuleEnabled(guild.id, colourRoles.MODULE);
  const health = await healthService.buildHealth(guild);
  const usage = await colourRoles.getUsage(guild);
  const top = usage.rows.slice(0, 5);
  const stylePreview = colourRoles.roleNameFor(section, 'Ocean Blue');
  const embed = new EmbedBuilder()
    .setColor(!enabled ? 0x747F8D : health.healthy ? 0x57F287 : 0xFAA61A)
    .setTitle('🌈 Colour Roles')
    .setDescription([
      `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Default palette:** ${section.palette.filter((item) => item.enabled).length} colours`,
      `**Custom HEX:** ${section.customHexEnabled ? 'Enabled ✅' : 'Disabled'}`,
      `**Managed Discord roles:** ${Object.keys(section.managedRoles).length}`,
      `**Members using colours:** ${usage.totalUsing}/${usage.totalMembers}`,
      `**Role format:** \`${stylePreview}\``,
      `**Anchor:** ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}> (${section.style.placement})` : '`Not set`'}`,
      `**Deployed:** ${section.deployment.channelId ? `<#${section.deployment.channelId}>` : '`Not deployed`'}`,
      '',
      '**Top colours**',
      top.length ? top.map((item, index) => `${index + 1}. **${item.label}** — ${item.count}`).join('\n') : '`No colours are currently in use.`',
      '',
      health.issues.length ? `⚠️ ${health.issues.length} health issue(s)` : '✅ Health checks passed',
    ].join('\n'))
    .setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button(enabled ? 'admin:colourRoles:disable' : 'admin:colourRoles:enable', enabled ? '⏸ Disable' : '▶ Enable', enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:colourRoles:style', '🎨 Role Style', ButtonStyle.Primary),
        button('admin:colourRoles:placement', '↕️ Placement', ButtonStyle.Primary),
        button('admin:colourRoles:stats', '📊 Stats', ButtonStyle.Primary),
      ),
      row(
        button('admin:colourRoles:toggleCustom', section.customHexEnabled ? '🎨 HEX On' : '🎨 HEX Off', section.customHexEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:colourRoles:scanStyle', '🔎 Scan Guild Style'),
        button('admin:colourRoles:deploy', '📨 Deploy Picker', ButtonStyle.Success),
        button('admin:colourRoles:health', '🩺 Health'),
      ),
      row(button('admin:studio:roleStudio', '⬅️ Back to Role Studio')),
    ],
  };
}

function buildPlacementPanel(guild, requestedBy = 'Unknown User') {
  const section = colourRoles.getSection(guild.id);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('↕️ Colour Roles · Placement').setDescription([
      'Choose an existing divider/anchor role. Goliath only reorders its own managed Colour Roles around this anchor.',
      '',
      `**Anchor:** ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}>` : '`Not set`'}`,
      `**Placement:** ${section.style.placement === 'above' ? 'Above anchor' : 'Below anchor'}`,
      `**Keep grouped:** ${section.style.keepGrouped ? 'Yes ✅' : 'No'}`,
      '',
      'Unrelated guild roles are never intentionally moved or re-sorted by Colour Roles.',
    ].join('\n')).setFooter({ text: `Requested by ${requestedBy}` })],
    components: [
      row(new RoleSelectMenuBuilder().setCustomId('admin:colourRoles:anchor').setPlaceholder('Select divider / anchor role').setMinValues(0).setMaxValues(1)),
      row(
        button('admin:colourRoles:togglePlacement', section.style.placement === 'above' ? '⬆️ Above' : '⬇️ Below', ButtonStyle.Primary),
        button('admin:colourRoles:toggleGrouped', section.style.keepGrouped ? '🧲 Grouping On' : '🧲 Grouping Off', section.style.keepGrouped ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:colourRoles', '⬅️ Back'),
      ),
    ],
  };
}

async function buildStatsPanel(guild, requestedBy = 'Unknown User') {
  const usage = await colourRoles.getUsage(guild);
  const max = Math.max(1, ...usage.rows.map((item) => item.count));
  const lines = usage.rows.slice(0, 20).map((item, index) => {
    const blocks = Math.max(item.count ? 1 : 0, Math.round((item.count / max) * 12));
    return `${index + 1}. **${item.label}** ${'█'.repeat(blocks)} ${item.count}`;
  });
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Colour Roles · Leaderboard').setDescription([
      `**Using Colour Roles:** ${usage.totalUsing}/${usage.totalMembers}`,
      '',
      lines.length ? lines.join('\n') : '`No members currently have a managed colour role.`',
      '',
      'Use the selector below to view the members currently using a colour.',
    ].join('\n').slice(0, 4096)).setFooter({ text: `Requested by ${requestedBy}` })],
    components: [
      usage.rows.length ? row(new StringSelectMenuBuilder().setCustomId('admin:colourRoles:statsColour').setPlaceholder('View members by colour').setMinValues(1).setMaxValues(1).addOptions(usage.rows.slice(0, 25).map((item) => ({ label: `${item.label} (${item.count})`.slice(0, 100), value: item.hex })))) : null,
      row(button('admin:colourRoles', '⬅️ Back')),
    ].filter(Boolean),
  };
}

async function buildMembersPanel(guild, hex, requestedBy = 'Unknown User') {
  const usage = await colourRoles.getUsage(guild);
  const item = usage.rows.find((rowData) => rowData.hex === colourRoles.normalizeHex(hex));
  const names = item?.members?.map((member) => `<@${member.id}>`) || [];
  return {
    embeds: [new EmbedBuilder().setColor(item ? colourRoles.hexToInt(item.hex) : 0x5865F2).setTitle(`👥 ${item?.label || hex}`).setDescription([
      `**Current members:** ${item?.count || 0}`,
      '',
      names.length ? names.slice(0, 80).join('\n') : '`Nobody currently uses this colour.`',
    ].join('\n').slice(0, 4096)).setFooter({ text: `Requested by ${requestedBy}` })],
    components: [row(button('admin:colourRoles:stats', '⬅️ Back to Stats'))],
  };
}

function styleModal(section) {
  return new ModalBuilder().setCustomId('admin:colourRoles:styleModal').setTitle('Colour Role Style').addComponents(
    row(new TextInputBuilder().setCustomId('format').setLabel('Role format').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(section.style.format || '🎨 | {colour}')).setPlaceholder('♥️ | {colour}')),
    row(new TextInputBuilder().setCustomId('icon').setLabel('Icon / prefix').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(section.style.icon || '')).setPlaceholder('♥️')),
    row(new TextInputBuilder().setCustomId('separator').setLabel('Divider / separator').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(section.style.separator || '|')).setPlaceholder('|')),
  );
}

function customHexModal() {
  return new ModalBuilder().setCustomId('colourRoles:customModal').setTitle('Pick Your Own Colour').addComponents(
    row(new TextInputBuilder().setCustomId('hex').setLabel('HEX colour').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('#1EA7FF')),
    row(new TextInputBuilder().setCustomId('label').setLabel('Colour name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Sky Blue')),
  );
}

async function deployPicker(interaction) {
  const section = colourRoles.getSection(interaction.guild.id);
  const channelId = section.deployment.channelId || interaction.channelId;
  const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error('Choose a valid deployment channel first.');
  let message = null;
  if (section.deployment.messageId) message = await channel.messages.fetch(section.deployment.messageId).catch(() => null);
  const payload = buildMemberPayload(interaction.guild);
  message = message ? await message.edit(payload) : await channel.send(payload);
  colourRoles.updateSection(interaction.guild.id, (current) => ({ ...current, deployment: { channelId: channel.id, messageId: message.id } }), { actorId: interaction.user.id, action: 'colour_roles_deployed' });
  return message;
}

async function handleColourRolesInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:colourRoles') && !id.startsWith('colourRoles:')) return false;
  try {
    if (id === 'admin:colourRoles') return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    if (id === 'admin:colourRoles:enable' || id === 'admin:colourRoles:disable') {
      guildManager.setModuleEnabled(interaction.guild.id, colourRoles.MODULE, id.endsWith(':enable'), { actorId: interaction.user.id });
      return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:toggleCustom') {
      const config = colourRoles.getSection(interaction.guild.id);
      colourRoles.updateSection(interaction.guild.id, { ...config, customHexEnabled: !config.customHexEnabled }, { actorId: interaction.user.id });
      return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:style') return interaction.showModal(styleModal(colourRoles.getSection(interaction.guild.id)));
    if (id === 'admin:colourRoles:styleModal' && interaction.isModalSubmit?.()) {
      const config = colourRoles.getSection(interaction.guild.id);
      colourRoles.updateSection(interaction.guild.id, {
        ...config,
        style: {
          ...config.style,
          format: interaction.fields.getTextInputValue('format') || config.style.format,
          icon: interaction.fields.getTextInputValue('icon') || '',
          separator: interaction.fields.getTextInputValue('separator') || '|',
        },
      }, { actorId: interaction.user.id });
      await colourRoles.reorderManagedRoles(interaction.guild);
      return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:scanStyle') {
      const config = colourRoles.getSection(interaction.guild.id);
      const suggestion = colourRoles.suggestRoleStyle(interaction.guild);
      colourRoles.updateSection(interaction.guild.id, { ...config, style: { ...config.style, ...suggestion, detectedFormat: suggestion.format } }, { actorId: interaction.user.id });
      return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:placement') return update(interaction, buildPlacementPanel(interaction.guild, displayName(interaction)));
    if (id === 'admin:colourRoles:anchor' && interaction.isRoleSelectMenu?.()) {
      const config = colourRoles.getSection(interaction.guild.id);
      colourRoles.updateSection(interaction.guild.id, { ...config, style: { ...config.style, anchorRoleId: interaction.values?.[0] || null } }, { actorId: interaction.user.id });
      await colourRoles.reorderManagedRoles(interaction.guild);
      return update(interaction, buildPlacementPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:togglePlacement') {
      const config = colourRoles.getSection(interaction.guild.id);
      colourRoles.updateSection(interaction.guild.id, { ...config, style: { ...config.style, placement: config.style.placement === 'above' ? 'below' : 'above' } }, { actorId: interaction.user.id });
      await colourRoles.reorderManagedRoles(interaction.guild);
      return update(interaction, buildPlacementPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:toggleGrouped') {
      const config = colourRoles.getSection(interaction.guild.id);
      colourRoles.updateSection(interaction.guild.id, { ...config, style: { ...config.style, keepGrouped: !config.style.keepGrouped } }, { actorId: interaction.user.id });
      return update(interaction, buildPlacementPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:deployChannel' && interaction.isChannelSelectMenu?.()) {
      const config = colourRoles.getSection(interaction.guild.id);
      colourRoles.updateSection(interaction.guild.id, { ...config, deployment: { ...config.deployment, channelId: interaction.values?.[0] || null } }, { actorId: interaction.user.id });
      return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:deploy') {
      const config = colourRoles.getSection(interaction.guild.id);
      if (!config.deployment.channelId) {
        return update(interaction, {
          embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📨 Colour Roles · Deploy').setDescription('Choose the channel where members should pick their colour.')],
          components: [
            row(new ChannelSelectMenuBuilder().setCustomId('admin:colourRoles:deployChannel').setPlaceholder('Select colour picker channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1)),
            row(button('admin:colourRoles', '⬅️ Back')),
          ],
        });
      }
      await deployPicker(interaction);
      return update(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    }
    if (id === 'admin:colourRoles:stats') return update(interaction, await buildStatsPanel(interaction.guild, displayName(interaction)));
    if (id === 'admin:colourRoles:statsColour' && interaction.isStringSelectMenu?.()) return update(interaction, await buildMembersPanel(interaction.guild, interaction.values?.[0], displayName(interaction)));
    if (id === 'admin:colourRoles:health') {
      const health = await healthService.buildHealth(interaction.guild);
      return update(interaction, {
        embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57F287 : 0xFAA61A).setTitle('🩺 Colour Roles · Health').setDescription([
          `**Status:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`,
          `**Managed roles:** ${health.managedRoleCount}`,
          `**Members using colours:** ${health.totalUsing}/${health.totalMembers}`,
          '',
          health.issues.length ? `**Issues**\n${health.issues.map((item) => `• ${item}`).join('\n')}` : '**Issues:** None',
          health.warnings.length ? `\n**Warnings**\n${health.warnings.slice(0, 12).map((item) => `• ${item}`).join('\n')}` : '',
        ].join('\n').slice(0, 4096))],
        components: [row(button('admin:colourRoles:repair', '🛠️ Repair', ButtonStyle.Success), button('admin:colourRoles', '⬅️ Back'))],
      });
    }
    if (id === 'admin:colourRoles:repair') {
      await interaction.deferUpdate();
      await healthService.repair(interaction.guild, { actorId: interaction.user.id });
      return interaction.editReply(await buildAdminPanel(interaction.guild, displayName(interaction)));
    }

    if (id === 'colourRoles:choose' && interaction.isStringSelectMenu?.()) {
      const result = await colourRoles.chooseColour(interaction.member, interaction.values?.[0]);
      return interaction.reply({ content: `✅ Your colour is now **${result.label}** (${result.hex}).`, ephemeral: true });
    }
    if (id === 'colourRoles:custom') return interaction.showModal(customHexModal());
    if (id === 'colourRoles:customModal' && interaction.isModalSubmit?.()) {
      const hex = interaction.fields.getTextInputValue('hex');
      const label = interaction.fields.getTextInputValue('label') || null;
      const result = await colourRoles.chooseColour(interaction.member, hex, { label });
      return interaction.reply({ content: `✅ Your custom colour is now **${result.label}** (${result.hex}).`, ephemeral: true });
    }
    if (id === 'colourRoles:remove') {
      const result = await colourRoles.removeColour(interaction.member);
      return interaction.reply({ content: result.removed ? '✅ Your Colour Role has been removed.' : 'ℹ️ You do not currently have a Colour Role.', ephemeral: true });
    }
    return false;
  } catch (error) {
    const payload = { content: `❌ Colour Roles failed: ${error.message || error}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildAdminPanel, buildPlacementPanel, buildStatsPanel, buildMembersPanel, buildMemberPayload,
  handleColourRolesInteraction,
};
