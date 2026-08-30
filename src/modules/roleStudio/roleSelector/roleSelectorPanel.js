'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const security = require('../../../core/security/protection/core');
const emojis = require('../../utilityStudio/emojis/emojis');
const roleSelector = require('./roleSelector');
const healthService = require('./roleSelectorHealth');
const { withDeploymentLock } = require('./roleSelectorLocks');

const sessions = new Map();
const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const linkButton = (label, url) => new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
const cleanId = (value) => { const id = String(value || '').replace(/[^0-9]/g, ''); return /^\d{15,25}$/.test(id) ? id : null; };
const key = (i) => `${i.guildId}:${i.user.id}`;
const actorName = (i) => i.member?.displayName || i.user?.username || 'Unknown User';

function state(i) {
  const k = key(i);
  const value = sessions.get(k) || { groupId: null, deploymentId: null, statsGroupId: null, statsOptionId: null, statsPage: 0, pendingChannelId: null, pendingStatsChannelId: null };
  sessions.set(k, value);
  return value;
}
async function respond(i, payload) {
  if (i.isModalSubmit?.()) return i.reply({ ...payload, flags: 64 });
  if (i.deferred || i.replied) return i.editReply(payload);
  return i.update(payload);
}
function nav(back = 'admin:roleSelector', settingsDisabled = false) { return row(button(back, '⬅️ Back'), button('admin:roleSelector:settings', '⚙️ Settings', ButtonStyle.Secondary, settingsDisabled)); }
function rootNav() { return row(button('admin:studio:roleStudio', '⬅️ Back to Role Studio'), button('admin:roleSelector:settings', '⚙️ Settings')); }
function groups(guildId) { return roleSelector.listGroups(guildId); }
function customGroups(guildId) { return groups(guildId).filter((g) => !g.builtIn); }

async function resolveComponents(guild, components = []) {
  const allowed = await emojis.allowedGuildEmojis(guild.client, guild.id);
  return components.map((entry) => {
    const data = typeof entry?.toJSON === 'function' ? entry.toJSON() : entry;
    if (!data?.components) return entry;
    return { ...data, components: data.components.map((c) => {
      if (c.type !== 3 || !Array.isArray(c.options)) return c;
      return { ...c, options: c.options.map((o) => {
        const match = String(o?.emoji?.name || '').match(/^:([A-Za-z0-9_]{2,32}):$/);
        if (!match) return o;
        const found = allowed.get(match[1].toLowerCase());
        if (found) return { ...o, emoji: emojis.componentPayload(found) };
        const next = { ...o }; delete next.emoji; return next;
      }) };
    }) };
  });
}
async function resolvePayload(guild, payload) {
  return { ...payload, content: payload.content == null ? payload.content : await emojis.resolveText(guild.client, guild.id, payload.content), embeds: await emojis.resolveEmbeds(guild.client, guild.id, payload.embeds || []), components: await resolveComponents(guild, payload.components || []) };
}

function groupMenu(guildId, selected = null, customId = 'admin:roleSelector:groupSelect', multi = false, selectedIds = []) {
  const list = groups(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(multi ? 'Choose groups for this panel' : 'Choose a group').setMinValues(multi ? 1 : 1).setMaxValues(multi ? Math.max(1, list.length) : 1);
  if (!list.length) return row(menu.setDisabled(true).addOptions({ label: 'No groups available', value: '__none__' }));
  menu.addOptions(list.map((g) => ({ label: `${g.emoji || '🏷️'} ${g.name}`.slice(0, 100), value: g.id, description: (g.builtIn ? 'Built-in group · protected' : `${g.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'} · ${(g.options || []).length} options`).slice(0, 100), default: multi ? selectedIds.includes(g.id) : g.id === selected })));
  return row(menu);
}
function memberCategoryMenu(guild, allowedIds = null, selected = null, customId = 'roleSelector:switchGroup') {
  const allowed = Array.isArray(allowedIds) && allowedIds.length ? new Set(allowedIds) : null;
  const list = groups(guild.id).filter((g) => roleSelector.isGroupMemberUsable(g) && (!allowed || allowed.has(g.id))).slice(0, 25);
  const current = list.find((g) => g.id === selected);
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(current ? `Current: ${current.name} · choose or switch`.slice(0, 150) : 'Choose a category').setMinValues(1).setMaxValues(1);
  if (!list.length) return row(menu.setDisabled(true).addOptions({ label: 'No selectors available', value: '__none__' }));
  menu.addOptions(list.map((g) => ({ label: `${g.emoji || '🏷️'} ${g.name}`.slice(0, 100), value: g.id, description: (g.description || 'Choose your roles').slice(0, 100) })));
  return row(menu);
}
function memberDisabledPayload() { return { embeds: [new EmbedBuilder().setColor(0x747F8D).setTitle('🎭 Role Selector').setDescription('Role Selector is currently unavailable.')], components: [] }; }
function memberLauncherPayload(guild, allowedIds = null, deploymentId = null) {
  if (!guildManager.isModuleEnabled(guild.id, roleSelector.MODULE)) return memberDisabledPayload();
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎭 Choose Your Roles').setDescription('Choose a category below. Each category manages only its own roles.')], components: [memberCategoryMenu(guild, allowedIds, null, deploymentId ? `roleSelector:openGroup:${deploymentId}` : 'roleSelector:openGroup')] };
}
function memberGroupPayload(guild, member, groupId, allowedIds = null, deploymentId = null) {
  roleSelector.assertModuleEnabled(guild.id);
  const group = roleSelector.getGroup(guild.id, groupId);
  if (!group || !roleSelector.isGroupMemberUsable(group) || (Array.isArray(allowedIds) && allowedIds.length && !allowedIds.includes(group.id))) throw new Error('That selector is unavailable on this panel.');
  const components = [memberCategoryMenu(guild, allowedIds, group.id, deploymentId ? `roleSelector:switchGroup:${deploymentId}` : 'roleSelector:switchGroup')];
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${group.emoji || '🏷️'} ${group.name}`).setDescription([group.description || 'Choose your role.', group.selectionMode === 'multiple' ? 'Select every option that applies.' : 'Select one option.', group.allowRemove ? 'You may clear this category at any time.' : null].filter(Boolean).join('\n'));
  if (group.type === 'colour') {
    const opts = group.palette.filter((x) => x.enabled).sort((a,b) => a.order-b.order).slice(0,24).map((x) => ({ label:x.label, value:x.hex, emoji:x.emoji || undefined, description:`${x.hex} · ${x.family}`.slice(0,100), default:Boolean(group.managedRoles?.[x.hex]?.roleId && member?.roles?.cache?.has(group.managedRoles[x.hex].roleId)) }));
    if (opts.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`roleSelector:colourChoose:${deploymentId || 'global'}`).setPlaceholder('Choose a colour').setMinValues(1).setMaxValues(1).addOptions(opts)));
    components.push(row(group.customHexEnabled ? button(`roleSelector:customHex:${deploymentId || 'global'}`, '🎨 Pick Your Own', ButtonStyle.Primary) : null, group.allowRemove ? button(`roleSelector:clear:colours:${deploymentId || 'global'}`, '🧹 Clear Selection') : null));
  } else {
    const opts = (group.options || []).filter((x) => x.enabled).sort((a,b) => a.order-b.order).slice(0,25).map((x) => ({ label:x.label, value:x.id, emoji:x.emoji || undefined, description:x.description || undefined, default:Boolean(x.roleId && member?.roles?.cache?.has(x.roleId)) }));
    if (opts.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`roleSelector:choose:${group.id}:${deploymentId || 'global'}`).setPlaceholder(group.selectionMode === 'multiple' ? 'Choose one or more' : 'Choose one').setMinValues(group.selectionMode === 'multiple' ? 0 : 1).setMaxValues(group.selectionMode === 'multiple' ? opts.length : 1).addOptions(opts)));
    if (group.allowRemove) components.push(row(button(`roleSelector:clear:${group.id}:${deploymentId || 'global'}`, '🧹 Clear Selection')));
  }
  return { embeds:[embed], components:components.filter((x) => x.components.length) };
}
async function freshMember(i) { return i.guild.members.fetch(i.user.id).catch(() => i.member); }

function normalizeDeployment(raw, fallbackId = null) {
  const id = String(raw?.id || fallbackId || '').trim() || `panel-${Date.now().toString(36)}`;
  return { id, channelId:cleanId(raw?.channelId), messageId:cleanId(raw?.messageId), groupIds:Array.isArray(raw?.groupIds) ? [...new Set(raw.groupIds.map(String))] : [], status:raw?.status === 'retired' ? 'retired' : 'active', createdAt:raw?.createdAt || new Date().toISOString() };
}
function deploymentList(section) {
  let list = Array.isArray(section?.deployments) ? section.deployments.map((d) => normalizeDeployment(d)) : [];
  if (!list.length && section?.deployment?.channelId) list = [normalizeDeployment({ id:'legacy', channelId:section.deployment.channelId, messageId:section.deployment.messageId, groupIds:groupsFromSection(section), status:'active' })];
  return list;
}
function groupsFromSection(section) { return (section?.groupOrder || Object.keys(section?.groups || {})).filter((id) => section?.groups?.[id]); }
function saveDeployments(guildId, list, meta = {}) {
  return roleSelector.updateSection(guildId, (current) => ({ ...current, deployments:list.map((d) => normalizeDeployment(d)), deployment:{ channelId:null, messageId:null } }), meta);
}
function deploymentById(guildId, id) { return deploymentList(roleSelector.getSection(guildId)).find((d) => d.id === id) || null; }
function deploymentAllowedGroups(guildId, deploymentId) {
  if (!deploymentId || deploymentId === 'global') return null;
  const d = deploymentById(guildId, deploymentId);
  return d?.groupIds?.length ? d.groupIds : null;
}
async function fetchDeployment(guild, d) {
  if (!d?.channelId) return { channel:null, message:null };
  const channel = guild.channels.cache.get(d.channelId) || await guild.channels.fetch(d.channelId).catch(() => null);
  const message = channel?.messages?.fetch && d.messageId ? await channel.messages.fetch(d.messageId).catch(() => null) : null;
  return { channel, message };
}
function owned(guild, message) { return Boolean(message && (!guild.client?.user?.id || message.author?.id === guild.client.user.id)); }
async function deploymentPayload(guild, d) { return resolvePayload(guild, memberLauncherPayload(guild, d.groupIds, d.id)); }
async function syncOneDeployment(guild, d) {
  if (d.status === 'retired') return { updated:false, reason:'retired' };
  const { message } = await fetchDeployment(guild, d);
  if (!message || !owned(guild, message)) return { updated:false, reason:message ? 'not_owned' : 'missing' };
  await message.edit(await deploymentPayload(guild, d));
  return { updated:true, messageId:message.id, channelId:message.channel.id };
}
async function syncDeploymentState(guild, changedGroupId = null) {
  return withDeploymentLock(guild.id, async () => {
    const list = deploymentList(roleSelector.getSection(guild.id));
    const targets = changedGroupId ? list.filter((d) => d.groupIds.includes(changedGroupId)) : list;
    const results = [];
    for (const d of targets) results.push(await syncOneDeployment(guild, d).catch((error) => ({ updated:false, reason:error.message })));
    return { updated:results.some((r) => r.updated), results };
  });
}
async function retireDeployment(guild, deployment) {
  return withDeploymentLock(guild.id, async () => {
    const d = typeof deployment === 'string' ? deploymentById(guild.id, deployment) : deployment;
    if (!d) return false;
    const { message } = await fetchDeployment(guild, d);
    if (!owned(guild, message)) return false;
    await message.edit(memberDisabledPayload()).catch(() => null);
    return true;
  });
}

async function buildAdminPanel(guild, requestedBy = 'Unknown User') {
  const section = roleSelector.getSection(guild.id); const health = await healthService.buildHealth(guild); const usage = await roleSelector.getUsage(guild); const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE); const deployments = deploymentList(section);
  return { embeds:[new EmbedBuilder().setColor(!enabled ? 0x747F8D : health.healthy ? 0x57F287 : 0xFAA61A).setTitle('🎭 Role Selector').setDescription([`**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,`**Groups:** ${groups(guild.id).length} (${customGroups(guild.id).length} custom)`,`**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,`**Deployments:** ${deployments.filter((d) => d.status === 'active').length} active`,`**Format:** \`${roleSelector.roleNameFor(section,'Example Role')}\``,`**Acceptance:** ${health.acceptance?.ready ? 'Ready ✅' : 'Not ready ⚠️'}`].join('\n')).setFooter({text:`Requested by ${requestedBy}`}).setTimestamp()], components:[row(button('admin:roleSelector:groups','🏷️ Groups',ButtonStyle.Primary),button('admin:roleSelector:style','🎨 Appearance',ButtonStyle.Primary),button('admin:roleSelector:deployment','📍 Deployments',ButtonStyle.Primary)),rootNav()] };
}
async function buildSettingsPanel(guild) {
  const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE); const health = await healthService.buildHealth(guild);
  return { embeds:[new EmbedBuilder().setColor(health.healthy?0x57F287:0xFAA61A).setTitle('⚙️ Role Selector · Settings').setDescription(`**Module:** ${enabled?'Enabled ✅':'Disabled ❌'}\n**Health:** ${health.healthy?'Healthy ✅':'Needs attention ⚠️'}\n\nModule controls, usage and diagnostics live here.`)], components:[row(button(enabled?'admin:roleSelector:disable':'admin:roleSelector:enable',enabled?'⏸ Disable':'▶ Enable'),button('admin:roleSelector:stats','📊 Stats',ButtonStyle.Primary),button('admin:roleSelector:health','🩺 Health / Repair')),nav('admin:roleSelector',true)] };
}
function buildGroupsPanel(i) {
  const s = state(i); const selected = s.groupId ? roleSelector.getGroup(i.guildId,s.groupId) : null;
  if (!selected) return { embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Groups').setDescription('Create and manage self-role categories.\n\n🌈 **Colours** is the protected built-in group.')], components:[groupMenu(i.guildId),row(button('admin:roleSelector:createGroup','➕ Create Group',ButtonStyle.Success)),nav()] };
  if (selected.type === 'colour') return buildColourPanel(i.guild,selected);
  const lines=(selected.options||[]).map((x)=>`${x.enabled?'✅':'⬜'} ${x.emoji||'•'} **${x.label}** · Role: ${x.managed===false?'Existing role':x.roleId?'Goliath-managed':'Auto-create'}`);
  return { embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Groups').setDescription([`${selected.emoji||'🏷️'} **${selected.name}**`,selected.description||'`No description`','',`**Type:** ${selected.selectionMode==='multiple'?'Multiple choices':'Single choice'}`,`**Options:** ${(selected.options||[]).length}`,`**Members can clear:** ${selected.allowRemove?'Yes ✅':'No'}`,'',lines.join('\n')||'`No options yet`'].join('\n').slice(0,4096))], components:[groupMenu(i.guildId,selected.id),row(button('admin:roleSelector:options','📝 Manage Options',ButtonStyle.Primary),button('admin:roleSelector:groupSettings','⚙️ Group Settings',ButtonStyle.Primary)),row(button('admin:roleSelector:deleteGroup','🗑️ Delete Group',ButtonStyle.Danger)),nav()] };
}
function buildColourPanel(guild, group) {
  const palette=[...group.palette].sort((a,b)=>a.order-b.order).slice(0,25); const menu=new StringSelectMenuBuilder().setCustomId('admin:roleSelector:palette').setPlaceholder('Enabled preset colours').setMinValues(0).setMaxValues(Math.max(1,palette.length)).addOptions(palette.map((x)=>({label:x.label,value:x.id,emoji:x.emoji||undefined,description:x.hex,default:x.enabled})));
  return { embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🌈 Role Selector · Groups · Colours').setDescription(['**Built-in group 🔒**','Choose preset colours and custom HEX availability.','',...palette.map((x)=>`${x.enabled?'✅':'⬜'} ${x.emoji} **${x.label}** · \`${x.hex}\``)].join('\n'))], components:[groupMenu(guild.id,group.id),row(menu),row(button('admin:roleSelector:toggleHex',group.customHexEnabled?'🎨 Custom HEX: On':'🎨 Custom HEX: Off'),button('admin:roleSelector:colourClearToggle',group.allowRemove?'🧹 Allow Clear: Yes':'🧹 Allow Clear: No')),nav()] };
}
function buildGroupSettings(i) { const g=roleSelector.getGroup(i.guildId,state(i).groupId); if(!g||g.builtIn) throw new Error('Select a custom group first.'); return {embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(`⚙️ ${g.emoji||'🏷️'} ${g.name} · Group Settings`).setDescription(`**Selection type:** ${g.selectionMode==='multiple'?'Multiple choices':'Single choice'}\n**Allow members to clear selection:** ${g.allowRemove?'Yes ✅':'No'}`)],components:[row(button('admin:roleSelector:toggleMode',g.selectionMode==='multiple'?'☑️ Multiple Choices':'1️⃣ Single Choice',ButtonStyle.Primary),button('admin:roleSelector:toggleRemove',g.allowRemove?'🧹 Allow Clear: Yes':'🧹 Allow Clear: No')),nav('admin:roleSelector:groups')]}; }
function buildAppearance(guild) { const s=roleSelector.getSection(guild.id); return {embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Role Selector · Appearance').setDescription(`**Role Style**\nFormat: \`${roleSelector.roleNameFor(s,'Example Role')}\`\nDetected suggestion: ${s.style.detectedFormat?`\`${s.style.detectedFormat}\``:'`Not scanned`'}\n\n**Role Placement**\nAnchor: ${s.style.anchorRoleId?`<@&${s.style.anchorRoleId}>`:'`Not set`'}\nPlacement: **${s.style.placement}**\nKeep roles together: **${s.style.keepGrouped?'Yes ✅':'No'}**`)],components:[row(new RoleSelectMenuBuilder().setCustomId('admin:roleSelector:anchor').setPlaceholder('Select divider / anchor role').setMinValues(0).setMaxValues(1)),row(button('admin:roleSelector:styleOpen','✏️ Edit Format',ButtonStyle.Primary),button('admin:roleSelector:scanStyle','🔎 Scan Guild Style'),button('admin:roleSelector:createDivider','➕ Create Divider',ButtonStyle.Success)),row(button('admin:roleSelector:togglePlacement',s.style.placement==='above'?'📍 Place Above':'📍 Place Below',ButtonStyle.Primary),button('admin:roleSelector:toggleGrouped',s.style.keepGrouped?'🧲 Keep Together: On':'🧲 Keep Together: Off')),s.style.detectedFormat?row(button('admin:roleSelector:applyStyle','✅ Apply Suggestion',ButtonStyle.Success)):null,nav()].filter(Boolean)}; }

function deploymentSelect(guildId, selectedId = null) {
  const list=deploymentList(roleSelector.getSection(guildId)).slice(0,25); const menu=new StringSelectMenuBuilder().setCustomId('admin:roleSelector:deploymentSelect').setPlaceholder(list.length?'Choose a deployed panel':'No deployments yet').setMinValues(1).setMaxValues(1);
  if(!list.length) return row(menu.setDisabled(true).addOptions({label:'No deployments yet',value:'__none__'}));
  menu.addOptions(list.map((d,index)=>({label:`Panel ${index+1}${d.status==='retired'?' · Retired':''}`.slice(0,100),value:d.id,description:`${d.channelId?'#channel':'No channel'} · ${d.groupIds.length} group(s)`.slice(0,100),default:d.id===selectedId}))); return row(menu);
}
async function buildDeploymentsPanel(i) {
  const list=deploymentList(roleSelector.getSection(i.guildId)); const selected=state(i).deploymentId ? list.find((d)=>d.id===state(i).deploymentId) : null;
  if(!selected) {
    const lines=await Promise.all(list.map(async(d,index)=>{const {message}=await fetchDeployment(i.guild,d); const names=d.groupIds.map((id)=>roleSelector.getGroup(i.guildId,id)?.name).filter(Boolean); return `**${index+1}.** ${d.channelId?`<#${d.channelId}>`:'`No channel`'} · ${d.status==='retired'?'Retired 📦':message?'Deployed ✅':'Not deployed ⚠️'}\n${names.length?names.join(' · '):'No groups selected'}`;}));
    return {content:null,embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('📍 Role Selector · Deployments').setDescription(['Deploy different Role Selector panels to different channels. The same group can appear on multiple panels.','',lines.join('\n\n')||'`No deployments yet`'].join('\n').slice(0,4096))],components:[deploymentSelect(i.guildId),row(button('admin:roleSelector:deploymentCreate','➕ Create Deployment',ButtonStyle.Success)),nav()]};
  }
  const {message}=await fetchDeployment(i.guild,selected); const names=selected.groupIds.map((id)=>roleSelector.getGroup(i.guildId,id)?.name).filter(Boolean); const jump=message?`https://discord.com/channels/${i.guildId}/${message.channel.id}/${message.id}`:null; const channelName=selected.channelId?i.guild.channels.cache.get(selected.channelId)?.name:null;
  const channelMenu=new ChannelSelectMenuBuilder().setCustomId('admin:roleSelector:deploymentChannel').setPlaceholder(channelName?`Current: #${channelName} · choose to change`:'Choose deployment channel').setMinValues(1).setMaxValues(1).setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement);
  return {content:null,embeds:[new EmbedBuilder().setColor(selected.status==='retired'?0x747F8D:0x5865F2).setTitle('📍 Role Selector · Manage Deployment').setDescription([`**Channel:** ${selected.channelId?`<#${selected.channelId}>`:'`Not selected`'}`,`**Message:** ${message?'Deployed ✅':selected.status==='retired'?'Retired 📦':'Not deployed'}`,`**Groups:** ${names.length?names.join(' · '):'`None selected`'}`,'','Choose one or more groups for this panel. Changes update this deployment in place.'].join('\n'))],components:[deploymentSelect(i.guildId,selected.id),row(channelMenu),groupMenu(i.guildId,null,'admin:roleSelector:deploymentGroups',true,selected.groupIds),row(button('admin:roleSelector:deploy',message?'🔄 Update Panel':'📨 Deploy Panel',ButtonStyle.Success,!selected.channelId||!selected.groupIds.length),jump?linkButton('↗️ Jump to Panel',jump):null),row(button('admin:roleSelector:deploymentRetire','📦 Retire Panel',ButtonStyle.Secondary,!message),button('admin:roleSelector:deploymentDelete','🗑️ Delete Deployment',ButtonStyle.Danger)),nav('admin:roleSelector:deployment')]};
}
async function deploySelected(i) {
  return withDeploymentLock(i.guildId,async()=>{const list=deploymentList(roleSelector.getSection(i.guildId)); const index=list.findIndex((d)=>d.id===state(i).deploymentId); if(index<0) throw new Error('Choose a deployment first.'); const d=list[index]; if(!d.channelId||!d.groupIds.length) throw new Error('Choose a channel and at least one group.'); const channel=i.guild.channels.cache.get(d.channelId)||await i.guild.channels.fetch(d.channelId).catch(()=>null); if(!channel?.send) throw new Error('Choose a sendable text channel.'); let message=d.messageId?await channel.messages.fetch(d.messageId).catch(()=>null):null; if(message&&!owned(i.guild,message)) message=null; message=message?await message.edit(await deploymentPayload(i.guild,d)):await channel.send(await deploymentPayload(i.guild,d)); list[index]={...d,messageId:message.id,status:'active'}; saveDeployments(i.guildId,list,{actorId:i.user.id,action:'role_selector_deploy'}); return message;});
}
async function deleteSelectedDeployment(i) {
  return withDeploymentLock(i.guildId,async()=>{const list=deploymentList(roleSelector.getSection(i.guildId)); const index=list.findIndex((d)=>d.id===state(i).deploymentId); if(index<0) throw new Error('Choose a deployment first.'); const d=list[index]; const {message}=await fetchDeployment(i.guild,d); if(message){if(!owned(i.guild,message)) throw new Error('Goliath will not delete a message it does not own.'); await message.delete();} list.splice(index,1); saveDeployments(i.guildId,list,{actorId:i.user.id,action:'role_selector_deployment_delete'}); state(i).deploymentId=null;});
}
async function retireSelectedDeployment(i) { const list=deploymentList(roleSelector.getSection(i.guildId)); const index=list.findIndex((d)=>d.id===state(i).deploymentId); if(index<0) throw new Error('Choose a deployment first.'); const d=list[index]; await retireDeployment(i.guild,d); list[index]={...d,status:'retired'}; saveDeployments(i.guildId,list,{actorId:i.user.id,action:'role_selector_deployment_retire'}); }

async function buildStats(guild) { const usage=await roleSelector.getUsage(guild); const rows=[]; for(const g of usage.groups||[]) for(const x of g.rows||[]) rows.push({...x,groupName:g.name,groupEmoji:g.emoji||'🏷️'}); rows.sort((a,b)=>Number(b.count||0)-Number(a.count||0)); const total=rows.reduce((s,x)=>s+Number(x.count||0),0); return {embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Role Selector · Stats').setDescription([`**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,`**Total selections:** ${total}`,'','**🏆 Most Selected**',rows.filter((x)=>x.count).slice(0,10).map((x,n)=>`${n+1}. ${x.groupEmoji} **${x.label}** — ${x.count} · ${x.groupName}`).join('\n')||'`No selections yet`'].join('\n'))],components:[groupMenu(guild.id,null,'admin:roleSelector:statsGroup'),nav('admin:roleSelector:settings',true)]}; }
async function buildHealth(guild, result=null) { const h=result||await healthService.buildHealth(guild); const fmt=(x)=>typeof x==='string'?x:x?.detail||x?.message||x?.code||JSON.stringify(x); return {embeds:[new EmbedBuilder().setColor(h.healthy?0x57F287:0xFAA61A).setTitle('🩺 Role Selector · Health / Repair').setDescription([`**Overall Health:** ${h.healthy?'Healthy ✅':'Needs Attention ⚠️'}`,`**Acceptance:** ${h.acceptance?.ready?'Ready ✅':'Not Ready ⚠️'}`,`**Managed Roles:** ${h.managedRoleCount||0}`,'','**Issues**',(h.issues||[]).length?(h.issues||[]).map((x)=>`• ${fmt(x)}`).join('\n'):'✅ No issues','','**Warnings**',(h.warnings||[]).length?(h.warnings||[]).map((x)=>`• ${fmt(x)}`).join('\n'):'✅ No warnings'].join('\n').slice(0,4096))],components:[row(button('admin:roleSelector:healthCheck','🔍 Run Check',ButtonStyle.Primary),button('admin:roleSelector:healthRepair','🛠️ Repair Safe Issues',ButtonStyle.Success)),nav('admin:roleSelector:settings',true)]}; }

function createGroupModal(){return new ModalBuilder().setCustomId('admin:roleSelector:createGroupSubmit').setTitle('Create Role Selector Group').addComponents(row(new TextInputBuilder().setCustomId('name').setLabel('Group name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),row(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji / icon').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),row(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)),row(new TextInputBuilder().setCustomId('mode').setLabel('Selection type: single or multiple').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setValue('single')));}
function optionsModal(g){return new ModalBuilder().setCustomId('admin:roleSelector:optionsSubmit').setTitle(`Options · ${g.name}`.slice(0,45)).addComponents(row(new TextInputBuilder().setCustomId('options').setLabel('emoji | label | description | roleId').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue((g.options||[]).map((x)=>`${x.emoji||''} | ${x.label} | ${x.description||''} | ${x.managed===false?x.roleId||'':''}`).join('\n'))));}
function styleModal(s){return new ModalBuilder().setCustomId('admin:roleSelector:styleSubmit').setTitle('Role Selector Appearance').addComponents(row(new TextInputBuilder().setCustomId('format').setLabel('Role format').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(s.style.format||'🎭 | {role}')),row(new TextInputBuilder().setCustomId('icon').setLabel('Default icon / prefix').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(s.style.icon||'')),row(new TextInputBuilder().setCustomId('separator').setLabel('Separator').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setValue(s.style.separator||'|')));}
function dividerModal(){return new ModalBuilder().setCustomId('admin:roleSelector:createDividerSubmit').setTitle('Create Role Selector Divider').addComponents(row(new TextInputBuilder().setCustomId('name').setLabel('Divider role name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue('🎭 | ROLE SELECTOR')));}
function hexModal(deploymentId='global'){return new ModalBuilder().setCustomId(`roleSelector:customHexSubmit:${deploymentId}`).setTitle('Pick Your Own Colour').addComponents(row(new TextInputBuilder().setCustomId('hex').setLabel('HEX colour').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setPlaceholder('#1EA7FF')),row(new TextInputBuilder().setCustomId('label').setLabel('Colour name').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60)));}
async function syncPanels(guild, changedGroupId=null){await syncDeploymentState(guild,changedGroupId).catch(()=>null);}

async function handleRoleSelectorInteraction(i) {
  const id=String(i.customId||''); const actor={actorId:i.user?.id}; if(!id.startsWith('admin:roleSelector')&&!id.startsWith('roleSelector:')&&!id.startsWith('admin:colourRoles')&&!id.startsWith('colourRoles:')) return false;
  try {
    if(id.startsWith('admin:')){const access=await security.enforceInteractionSecurity(i,{level:'admin',guildOnly:true});if(!access.allowed)return true;}
    if(id==='admin:colourRoles'||id==='admin:roleSelector'||id==='admin:roleSelector:home')return respond(i,await buildAdminPanel(i.guild,actorName(i)));
    if(id==='admin:roleSelector:settings')return respond(i,await buildSettingsPanel(i.guild));
    if(id==='admin:roleSelector:enable'||id==='admin:roleSelector:disable'){guildManager.setModuleEnabled(i.guildId,roleSelector.MODULE,id.endsWith(':enable'),{...actor,action:id});await syncPanels(i.guild);return respond(i,await buildSettingsPanel(i.guild));}
    if(id==='admin:roleSelector:groups'){state(i).groupId=null;return respond(i,buildGroupsPanel(i));}
    if(id==='admin:roleSelector:groupSelect'&&i.values?.[0]!=='__none__'){state(i).groupId=i.values[0];return respond(i,buildGroupsPanel(i));}
    if(id==='admin:roleSelector:createGroup'){await i.showModal(createGroupModal());return true;}
    if(id==='admin:roleSelector:createGroupSubmit'){const mode=i.fields.getTextInputValue('mode').trim().toLowerCase();if(!['single','multiple'].includes(mode))throw new Error('Selection type must be single or multiple.');const g=await roleSelector.saveGroupSafe(i.guild,{name:i.fields.getTextInputValue('name'),emoji:i.fields.getTextInputValue('emoji'),description:i.fields.getTextInputValue('description'),selectionMode:mode,allowRemove:true,options:[]},{...actor,action:'role_selector_create_group'});state(i).groupId=g.id;await syncPanels(i.guild,g.id);return i.reply({content:`✅ Created **${g.name}**.`,...buildGroupsPanel(i),flags:64});}
    if(id==='admin:roleSelector:options'){const g=roleSelector.getGroup(i.guildId,state(i).groupId);if(!g||g.builtIn)throw new Error('Select a custom group first.');await i.showModal(optionsModal(g));return true;}
    if(id==='admin:roleSelector:optionsSubmit'){const g=roleSelector.getGroup(i.guildId,state(i).groupId);if(!g||g.builtIn)throw new Error('Select a custom group first.');const old=new Map((g.options||[]).map((x)=>[x.label.toLowerCase(),x]));const options=i.fields.getTextInputValue('options').split(/\r?\n/).map((x)=>x.trim()).filter(Boolean).slice(0,25).map((line,n)=>{const [emoji,label,description,roleRaw]=line.split('|').map((x)=>x.trim());if(!label)throw new Error(`Option ${n+1} needs a label.`);const prev=old.get(label.toLowerCase());const roleId=cleanId(roleRaw);return {...(prev||{}),id:prev?.id,emoji,label,description,roleId:roleId||prev?.roleId||null,managed:roleId?false:prev?.managed!==false,enabled:true,order:(n+1)*10};});await roleSelector.saveGroupSafe(i.guild,{...g,options},{...actor,action:'role_selector_update_options'});await syncPanels(i.guild,g.id);return i.reply({content:'✅ Selector options saved.',...buildGroupsPanel(i),flags:64});}
    if(id==='admin:roleSelector:groupSettings')return respond(i,buildGroupSettings(i));
    if(id==='admin:roleSelector:toggleMode'||id==='admin:roleSelector:toggleRemove'){const g=roleSelector.getGroup(i.guildId,state(i).groupId);if(!g||g.builtIn)throw new Error('Select a custom group first.');await roleSelector.saveGroupSafe(i.guild,{...g,...(id.endsWith('toggleMode')?{selectionMode:g.selectionMode==='multiple'?'single':'multiple'}:{allowRemove:!g.allowRemove})},{...actor,action:id});await syncPanels(i.guild,g.id);return respond(i,buildGroupSettings(i));}
    if(id==='admin:roleSelector:deleteGroup'){const g=roleSelector.getGroup(i.guildId,state(i).groupId);if(!g||g.builtIn)throw new Error('Select a custom group first.');const result=await roleSelector.deleteManagedGroupRoles(i.guild,g.id);if(result.unresolved)throw new Error(`Group not deleted because ${result.unresolved} managed role(s) could not be removed.`);roleSelector.removeGroup(i.guildId,g.id,{...actor,action:'role_selector_delete_group'});const list=deploymentList(roleSelector.getSection(i.guildId)).map((d)=>({...d,groupIds:d.groupIds.filter((x)=>x!==g.id)}));saveDeployments(i.guildId,list,{...actor,action:'role_selector_prune_deployments'});state(i).groupId=null;await syncPanels(i.guild);return respond(i,buildGroupsPanel(i));}
    if(id==='admin:roleSelector:palette'||id==='admin:roleSelector:toggleHex'||id==='admin:roleSelector:colourClearToggle'){const g=roleSelector.getGroup(i.guildId,roleSelector.COLOUR_GROUP_ID);let next=g;if(id.endsWith(':palette')){const selected=new Set(i.values||[]);next={...g,palette:g.palette.map((x)=>({...x,enabled:selected.has(x.id) }))};}else if(id.endsWith(':toggleHex'))next={...g,customHexEnabled:!g.customHexEnabled};else next={...g,allowRemove:!g.allowRemove};await roleSelector.saveGroupSafe(i.guild,next,{...actor,action:id});await syncPanels(i.guild,g.id);return respond(i,buildColourPanel(i.guild,roleSelector.getGroup(i.guildId,roleSelector.COLOUR_GROUP_ID)));}
    if(id==='admin:roleSelector:style')return respond(i,buildAppearance(i.guild));
    if(id==='admin:roleSelector:styleOpen'){await i.showModal(styleModal(roleSelector.getSection(i.guildId)));return true;}
    if(id==='admin:roleSelector:styleSubmit'){roleSelector.updateSection(i.guildId,(s)=>({...s,style:{...s.style,format:i.fields.getTextInputValue('format'),icon:i.fields.getTextInputValue('icon'),separator:i.fields.getTextInputValue('separator')||'|'}}),{...actor,action:id});await roleSelector.syncManagedRoleAppearance(i.guild);await syncPanels(i.guild);return i.reply({content:'✅ Role appearance updated.',...buildAppearance(i.guild),flags:64});}
    if(id==='admin:roleSelector:anchor'){await roleSelector.setAnchorRole(i.guild,i.values?.[0]||null,{managed:false,meta:{...actor,action:id}});return respond(i,buildAppearance(i.guild));}
    if(id==='admin:roleSelector:togglePlacement'||id==='admin:roleSelector:toggleGrouped'){roleSelector.updateSection(i.guildId,(s)=>({...s,style:{...s.style,...(id.endsWith('togglePlacement')?{placement:s.style.placement==='above'?'below':'above'}:{keepGrouped:!s.style.keepGrouped})}}),{...actor,action:id});await roleSelector.syncManagedRoleHierarchy(i.guild);return respond(i,buildAppearance(i.guild));}
    if(id==='admin:roleSelector:scanStyle'){const suggestion=roleSelector.suggestRoleStyle(i.guild);roleSelector.updateSection(i.guildId,(s)=>({...s,style:{...s.style,detectedFormat:suggestion.format,detectedIcon:suggestion.icon,detectedSeparator:suggestion.separator,detectedConfidence:suggestion.confidence}}),{...actor,action:id});return respond(i,buildAppearance(i.guild));}
    if(id==='admin:roleSelector:applyStyle'){roleSelector.updateSection(i.guildId,(s)=>({...s,style:{...s.style,format:s.style.detectedFormat||s.style.format,icon:s.style.detectedIcon||'',separator:s.style.detectedSeparator||s.style.separator}}),{...actor,action:id});await roleSelector.syncManagedRoleAppearance(i.guild);await syncPanels(i.guild);return respond(i,buildAppearance(i.guild));}
    if(id==='admin:roleSelector:createDivider'){await i.showModal(dividerModal());return true;}
    if(id==='admin:roleSelector:createDividerSubmit'){const divider=await i.guild.roles.create({name:i.fields.getTextInputValue('name').trim().slice(0,100),permissions:[],hoist:false,mentionable:false,reason:'Goliath Role Selector divider'});await roleSelector.setAnchorRole(i.guild,divider.id,{managed:true,meta:{...actor,action:id}});return i.reply({content:`✅ Created divider **${divider.name}**.`,...buildAppearance(i.guild),flags:64});}

    if(id==='admin:roleSelector:deployment'){state(i).deploymentId=null;return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:deploymentSelect'&&i.values?.[0]!=='__none__'){state(i).deploymentId=i.values[0];return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:deploymentCreate'){const list=deploymentList(roleSelector.getSection(i.guildId));const d=normalizeDeployment({id:`panel-${Date.now().toString(36)}`,groupIds:[]});list.push(d);saveDeployments(i.guildId,list,{...actor,action:'role_selector_deployment_create'});state(i).deploymentId=d.id;return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:deploymentGroups'){const list=deploymentList(roleSelector.getSection(i.guildId));const index=list.findIndex((d)=>d.id===state(i).deploymentId);if(index<0)throw new Error('Choose a deployment first.');list[index]={...list[index],groupIds:[...new Set(i.values||[])]};saveDeployments(i.guildId,list,{...actor,action:'role_selector_deployment_groups'});await syncOneDeployment(i.guild,list[index]).catch(()=>null);return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:deploymentChannel'){const target=i.values?.[0];if(!target)throw new Error('Choose a deployment channel.');const list=deploymentList(roleSelector.getSection(i.guildId));const index=list.findIndex((d)=>d.id===state(i).deploymentId);if(index<0)throw new Error('Choose a deployment first.');const d=list[index];if(d.messageId&&d.channelId&&d.channelId!==target){state(i).pendingChannelId=target;return respond(i,{embeds:[new EmbedBuilder().setColor(0xFAA61A).setTitle('📍 Move this Role Selector panel?').setDescription(`Current: <#${d.channelId}>\nNew: <#${target}>\n\nChoose what to do with the old Goliath-owned panel.`)],components:[row(button('admin:roleSelector:moveRemove','🗑️ Remove Old Panel & Move',ButtonStyle.Danger),button('admin:roleSelector:moveRetire','📦 Retire Old Panel & Move',ButtonStyle.Primary)),row(button('admin:roleSelector:moveCancel','⬅️ Back'))]});}list[index]={...d,channelId:target,messageId:d.channelId===target?d.messageId:null};saveDeployments(i.guildId,list,{...actor,action:'role_selector_deployment_channel'});return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:moveCancel'){state(i).pendingChannelId=null;return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:moveRemove'||id==='admin:roleSelector:moveRetire'){const list=deploymentList(roleSelector.getSection(i.guildId));const index=list.findIndex((d)=>d.id===state(i).deploymentId);if(index<0)throw new Error('Choose a deployment first.');const d=list[index];const {message}=await fetchDeployment(i.guild,d);if(message){if(!owned(i.guild,message))throw new Error('Goliath will not modify a message it does not own.');if(id.endsWith('moveRemove'))await message.delete();else await message.edit(memberDisabledPayload());}list[index]={...d,channelId:state(i).pendingChannelId,messageId:null,status:'active'};state(i).pendingChannelId=null;saveDeployments(i.guildId,list,{...actor,action:id});const sent=await deploySelected(i);const payload=await buildDeploymentsPanel(i);payload.content=`✅ Panel moved to <#${sent.channel.id}>.`;return respond(i,payload);}
    if(id==='admin:roleSelector:deploy'){const message=await deploySelected(i);const payload=await buildDeploymentsPanel(i);payload.content=`✅ Role Selector panel deployed in <#${message.channel.id}>.`;return respond(i,payload);}
    if(id==='admin:roleSelector:deploymentRetire'){await retireSelectedDeployment(i);return respond(i,await buildDeploymentsPanel(i));}
    if(id==='admin:roleSelector:deploymentDelete'){await deleteSelectedDeployment(i);return respond(i,await buildDeploymentsPanel(i));}

    if(id==='admin:roleSelector:stats')return respond(i,await buildStats(i.guild));
    if(id==='admin:roleSelector:statsGroup'&&i.values?.[0]!=='__none__'){const usage=await roleSelector.getUsage(i.guild,i.values[0]);const g=usage.groups?.[0];return respond(i,{embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${g?.emoji||'🏷️'} ${g?.name||'Group'}`).setDescription((g?.rows||[]).map((x,n)=>`${n+1}. **${x.label}** — ${x.count||0}`).join('\n')||'`No selections yet`')],components:[nav('admin:roleSelector:stats',true)]});}
    if(id==='admin:roleSelector:health'||id==='admin:roleSelector:healthCheck')return respond(i,await buildHealth(i.guild));
    if(id==='admin:roleSelector:healthRepair'){const h=await healthService.repair(i.guild);await syncPanels(i.guild);return respond(i,await buildHealth(i.guild,h));}

    if(id.startsWith('roleSelector:'))roleSelector.assertModuleEnabled(i.guildId);
    if(id.startsWith('roleSelector:openGroup')){if(i.values?.[0]==='__none__')return i.reply({content:'No selector groups are available.',flags:64});const deploymentId=id.split(':')[2]||null;const allowed=deploymentAllowedGroups(i.guildId,deploymentId);return i.reply({...await resolvePayload(i.guild,memberGroupPayload(i.guild,await freshMember(i),i.values[0],allowed,deploymentId)),flags:64});}
    if(id.startsWith('roleSelector:switchGroup')){const deploymentId=id.split(':')[2]||null;const allowed=deploymentAllowedGroups(i.guildId,deploymentId);return i.update(await resolvePayload(i.guild,memberGroupPayload(i.guild,await freshMember(i),i.values[0],allowed,deploymentId)));}
    if(id.startsWith('roleSelector:colourChoose:')){const deploymentId=id.split(':')[2]||'global';await roleSelector.applyColourSelection(i.guild,i.member,i.values[0]);await i.update(await resolvePayload(i.guild,memberGroupPayload(i.guild,await freshMember(i),roleSelector.COLOUR_GROUP_ID,deploymentAllowedGroups(i.guildId,deploymentId),deploymentId)));await i.followUp({content:'✅ Your colour has been updated.',flags:64});return true;}
    if(id.startsWith('roleSelector:customHex:')){await i.showModal(hexModal(id.split(':')[2]||'global'));return true;}
    if(id.startsWith('roleSelector:customHexSubmit:')){await roleSelector.applyColourSelection(i.guild,i.member,i.fields.getTextInputValue('hex'),i.fields.getTextInputValue('label'));return i.reply({content:'✅ Your custom colour has been applied.',flags:64});}
    if(id.startsWith('roleSelector:choose:')){const parts=id.split(':');const groupId=parts[2];const deploymentId=parts[3]||'global';const allowed=deploymentAllowedGroups(i.guildId,deploymentId);if(allowed&&!allowed.includes(groupId))throw new Error('That group is not available on this panel.');await roleSelector.applyStandardSelection(i.guild,i.member,groupId,i.values||[]);await i.update(await resolvePayload(i.guild,memberGroupPayload(i.guild,await freshMember(i),groupId,allowed,deploymentId)));await i.followUp({content:'✅ Your role selection has been updated.',flags:64});return true;}
    if(id.startsWith('roleSelector:clear:')){const parts=id.split(':');const groupId=parts[2];const deploymentId=parts[3]||'global';const allowed=deploymentAllowedGroups(i.guildId,deploymentId);await roleSelector.clearSelection(i.guild,i.member,groupId);await i.update(await resolvePayload(i.guild,memberGroupPayload(i.guild,await freshMember(i),groupId,allowed,deploymentId)));await i.followUp({content:'✅ Your selection has been cleared.',flags:64});return true;}
    if(id==='colourRoles:choose'){await roleSelector.applyColourSelection(i.guild,i.member,i.values[0]);return i.reply({content:'✅ Your colour has been updated.',flags:64});}
    if(id==='colourRoles:remove'){await roleSelector.clearSelection(i.guild,i.member,roleSelector.COLOUR_GROUP_ID);return i.reply({content:'✅ Your colour has been removed.',flags:64});}
    if(id==='colourRoles:custom'){await i.showModal(hexModal());return true;}
    return true;
  } catch(error){console.error('[RoleSelectorPanel]',error);const payload={content:`❌ ${error.message||'Role Selector failed.'}`,flags:64};if(i.deferred||i.replied)await i.followUp(payload).catch(()=>null);else await i.reply(payload).catch(()=>null);return true;}
}

module.exports={buildAdminPanel,handleRoleSelectorInteraction,memberDisabledPayload,memberLauncherPayload,retireDeployment,syncDeploymentState};
