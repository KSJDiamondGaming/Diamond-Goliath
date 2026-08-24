'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../guild/guildManager');
const panelNav = require('../../ui/panelNavigation');

const PANEL_COLOR = '#5865F2';
const ENABLED_COLOR = '#57F287';
const DISABLED_COLOR = '#ED4245';
const AUTOMOD_RULES = {
  antiSpam: { label:'🚫 Spam', title:'🚫 Spam Protection', editLabel:'⏱️ Limits', defaults:{ enabled:false, maxMessages:5, intervalSeconds:10, actions:['delete'] } },
  antiLinks: { label:'🔗 Links', title:'🔗 Link Protection', editLabel:'🌐 Domains', defaults:{ enabled:false, allowStaff:true, allowedDomains:[], deniedDomains:[], actions:['delete'] } },
  badWords: { label:'🤬 Bad Words', title:'🤬 Bad Word Filter', editLabel:'📝 Word List', defaults:{ enabled:false, words:[], actions:['delete'] } },
  caps: { label:'🔠 Caps', title:'🔠 Caps Protection', editLabel:'📏 Thresholds', defaults:{ enabled:false, percent:70, minLength:12, actions:['warn'] } },
  mentions: { label:'📣 Mentions', title:'📣 Mention Protection', editLabel:'📣 Limit', defaults:{ enabled:false, maxMentions:5, actions:['warn'] } },
};
const AUTOMOD_RULE_KEYS = Object.keys(AUTOMOD_RULES);
const AUTOMOD_ACTIONS = ['dm','delete','warn','timeout','kick','ban'];
const ACTION_LABELS = { dm:'DM User', delete:'Delete Message', warn:'Warn User', timeout:'Timeout User', kick:'Kick User', ban:'Ban User' };
const DEFAULT_DM_MESSAGES = {
  antiSpam: '⚠️ **{server} AutoMod**\nSpam Protection triggered: {reason}',
  antiLinks: '⚠️ **{server} AutoMod**\nLink Protection triggered: {reason}',
  badWords: '⚠️ **{server} AutoMod**\nBad Word Filter triggered: {reason}',
  caps: '⚠️ **{server} AutoMod**\nCaps Protection triggered: {reason}',
  mentions: '⚠️ **{server} AutoMod**\nMention Protection triggered: {reason}',
};

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id,label,style=ButtonStyle.Primary,disabled=false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const getMemberDisplayName = i => i.member?.displayName || i.user?.displayName || i.user?.username || 'Unknown User';
const status = v => v ? 'Enabled ✅' : 'Disabled ❌';
function createEmbed(title, description, memberDisplayName, color=PANEL_COLOR) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) embed.setDescription(description);
  if (memberDisplayName) embed.setFooter({ text:`Requested by ${memberDisplayName}` });
  return embed;
}
function normalizeActions(value,fallback=['delete']) {
  const a=[...new Set((Array.isArray(value)?value:value?[value]:fallback).map(v=>String(v).toLowerCase()).filter(v=>AUTOMOD_ACTIONS.includes(v)))];
  const clean=a.includes('ban')?a.filter(v=>v!=='kick'):a;
  return clean.length?clean:[...fallback];
}
const formatActions = a => normalizeActions(a).map(v=>ACTION_LABELS[v]).join(', ');
function defaults(){
  return { enabled:false, dmUser:true, dmMessages:{...DEFAULT_DM_MESSAGES}, ...Object.fromEntries(AUTOMOD_RULE_KEYS.map(k=>[k,{...AUTOMOD_RULES[k].defaults}])), ignoredRoles:[], ignoredChannels:[] };
}
function getAutomodConfig(gid){
  const cur=guildManager.getGuildSection(gid,'automod',{}), d=defaults(), out={...d,...cur};
  for(const k of AUTOMOD_RULE_KEYS){
    const e=cur[k]||{};
    out[k]={...d[k],...e,actions:normalizeActions(e.actions||e.action,d[k].actions)};
    delete out[k].action;
  }
  out.antiLinks.allowedDomains=Array.isArray(out.antiLinks.allowedDomains)?out.antiLinks.allowedDomains:[];
  out.antiLinks.deniedDomains=Array.isArray(out.antiLinks.deniedDomains)?out.antiLinks.deniedDomains:[];
  out.dmMessages={...DEFAULT_DM_MESSAGES,...(cur.dmMessages||{})};
  out.ignoredRoles=Array.isArray(cur.ignoredRoles)?cur.ignoredRoles:[];
  out.ignoredChannels=Array.isArray(cur.ignoredChannels)?cur.ignoredChannels:[];
  return out;
}
const saveAutomodConfig = (gid,c) => guildManager.replaceGuildSection(gid,'automod',c);
function getLogChannelId(gid){ return typeof guildManager.getLogChannelId==='function' ? guildManager.getLogChannelId(gid,'automod') : guildManager.getGuildSection(gid,'logs',{channels:{}})?.channels?.automod||null; }
function setLogChannelId(gid,cid=null){
  if(typeof guildManager.setLogChannelId==='function') return guildManager.setLogChannelId(gid,'automod',cid);
  const logs=guildManager.getGuildSection(gid,'logs',{enabled:true,channels:{},events:{}});
  return guildManager.replaceGuildSection(gid,'logs',{...logs,channels:{...(logs.channels||{}),automod:cid}});
}
function canonicalState(route='admin:automod'){
  if(route==='admin:automod') return {history:['admin:home','admin:automod']};
  if(route==='admin:automod:configure'||route.startsWith('admin:automod:rule:')) return {history:['admin:home','admin:automod',route]};
  if(route==='admin:channel:automodlog') return {history:['admin:home','admin:automod','admin:automod:configure',route]};
  return {history:['admin:home','admin:automod']};
}
const backButton = route => button(panelNav.buildCustomId(canonicalState(route),'back'),'⬅️ Back',ButtonStyle.Secondary);
const navRow = (route,nextId,settingsId=null) => row(backButton(route),...(settingsId?[button(settingsId,'⚙️ Settings',ButtonStyle.Primary)]:[]),button(nextId,'Next ➡️',ButtonStyle.Secondary));
function buildAutomodPanel(guild,name='Unknown User'){
  const c=getAutomodConfig(guild.id), n=AUTOMOD_RULE_KEYS.filter(k=>c[k].enabled).length, buttons=AUTOMOD_RULE_KEYS.map(k=>[k,AUTOMOD_RULES[k].label,c[k].enabled?ButtonStyle.Success:ButtonStyle.Secondary]);
  return { embeds:[createEmbed('🤖 AutoMod Protection',[`**System:** ${status(c.enabled)}`,`**Protection rules:** ${n}/${AUTOMOD_RULE_KEYS.length} enabled`,'',...AUTOMOD_RULE_KEYS.map(k=>`**${AUTOMOD_RULES[k].label}:** ${status(c[k].enabled)}`),'','Select a protection rule, or open system settings.'].join('\n'),name,c.enabled?ENABLED_COLOR:DISABLED_COLOR)], components:[row(...buttons.slice(0,3).map(([k,l,s])=>button(`admin:automod:rule:${k}`,l,s))),row(...buttons.slice(3).map(([k,l,s])=>button(`admin:automod:rule:${k}`,l,s))),navRow('admin:automod','admin:adminpanel','admin:automod:configure')]};
}
function buildAutomodConfigurePanel(guild,name='Unknown User'){
  const c=getAutomodConfig(guild.id);
  return { embeds:[createEmbed('⚙️ AutoMod Settings',[`**AutoMod:** ${status(c.enabled)}`,`**DM users:** ${status(c.dmUser!==false)}`,`**AutoMod log:** ${getLogChannelId(guild.id)?`<#${getLogChannelId(guild.id)}>`:'Not set'}`,'','Configure AutoMod status, logging and the DM sent for each infraction.'].join('\n'),name,c.enabled?ENABLED_COLOR:DISABLED_COLOR)],components:[row(button('admin:automod:toggle',c.enabled?'Disable AutoMod':'Enable AutoMod',c.enabled?ButtonStyle.Danger:ButtonStyle.Success),button('admin:automod:dm',c.dmUser!==false?'Disable DMs':'Enable DMs',c.dmUser!==false?ButtonStyle.Danger:ButtonStyle.Success),button('admin:automod:dmmessage','✉️ DM Message',ButtonStyle.Primary)),row(button('admin:setautomodlog','🤖 AutoMod Log',ButtonStyle.Secondary),button('admin:automod:reset','♻️ Reset',ButtonStyle.Danger)),navRow('admin:automod:configure','admin:automod:rule:antiSpam')]};
}
function ruleSummary(k,r){
  if(k==='antiSpam')return`**Maximum messages:** ${r.maxMessages}\n**Window:** ${r.intervalSeconds} seconds\n**Actions:** ${formatActions(r.actions)}`;
  if(k==='antiLinks')return`**Staff bypass:** ${r.allowStaff?'Yes':'No'}\n**Allowed domains:** ${r.allowedDomains?.length||0}\n**Denied domains:** ${r.deniedDomains?.length||0}\n**Actions:** ${formatActions(r.actions)}`;
  if(k==='badWords')return`**Blocked words:** ${r.words?.length||0}\n**Actions:** ${formatActions(r.actions)}`;
  if(k==='caps')return`**Caps threshold:** ${r.percent}%\n**Minimum length:** ${r.minLength}\n**Actions:** ${formatActions(r.actions)}`;
  return`**Maximum mentions:** ${r.maxMentions}\n**Actions:** ${formatActions(r.actions)}`;
}
function nextRuleId(k){ const i=AUTOMOD_RULE_KEYS.indexOf(k); return i===AUTOMOD_RULE_KEYS.length-1?'admin:automod':`admin:automod:rule:${AUTOMOD_RULE_KEYS[i+1]}`; }
function buildActionSelect(k,r){ return new StringSelectMenuBuilder().setCustomId(`admin:automod:rule:${k}:actions`).setPlaceholder('Select one or more actions').setMinValues(1).setMaxValues(AUTOMOD_ACTIONS.length).addOptions(AUTOMOD_ACTIONS.map(v=>({label:ACTION_LABELS[v],value:v,default:normalizeActions(r.actions).includes(v)}))); }
function buildAutomodRulePanel(guild,k,name='Unknown User'){
  const c=getAutomodConfig(guild.id), meta=AUTOMOD_RULES[k], r=c[k], route=`admin:automod:rule:${k}`;
  return {embeds:[createEmbed(meta.title,[`**Status:** ${status(r.enabled)}`,'',ruleSummary(k,r),'','Choose the exact settings and select every action that should run when this rule triggers.'].join('\n'),name,r.enabled?ENABLED_COLOR:DISABLED_COLOR)],components:[row(button(`${route}:toggle`,r.enabled?'Disable':'Enable',r.enabled?ButtonStyle.Danger:ButtonStyle.Success),button(`${route}:edit`,meta.editLabel)),row(buildActionSelect(k,r)),navRow(route,nextRuleId(k),`${route}:edit`)]};
}
function textInput(id,label,value,{placeholder='',required=true,style=TextInputStyle.Short,maxLength=null}={}){
  const input=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  const val=String(value??'').trim(); if(val) input.setValue(val); if(placeholder) input.setPlaceholder(placeholder); if(maxLength) input.setMaxLength(maxLength); return row(input);
}
function buildRuleModal(k,r){
  const m=new ModalBuilder().setCustomId(`admin:automod:rule:${k}:modal`).setTitle(`${AUTOMOD_RULES[k].title} Settings`);
  if(k==='antiSpam')m.addComponents(textInput('maxMessages','Maximum messages',r.maxMessages),textInput('intervalSeconds','Time window in seconds',r.intervalSeconds));
  if(k==='antiLinks')m.addComponents(textInput('allowStaff','Allow staff? true or false',r.allowStaff),textInput('allowedDomains','Allowed domains, comma separated',(r.allowedDomains||[]).join(', '),{placeholder:'trusted.example, discord.com',required:false,style:TextInputStyle.Paragraph}),textInput('deniedDomains','Denied domains, comma separated',(r.deniedDomains||[]).join(', '),{placeholder:'blocked.example, scam.example',required:false,style:TextInputStyle.Paragraph}));
  if(k==='badWords')m.addComponents(textInput('words','Blocked words, comma separated',(r.words||[]).join(', '),{placeholder:'word1, word2',required:false,style:TextInputStyle.Paragraph}));
  if(k==='caps')m.addComponents(textInput('percent','Capital letter percentage',r.percent),textInput('minLength','Minimum message length',r.minLength));
  if(k==='mentions')m.addComponents(textInput('maxMentions','Maximum mentions',r.maxMentions));
  return m;
}
function buildDmMessagesModal(config){
  const m=new ModalBuilder().setCustomId('admin:automod:dmmessage:modal').setTitle('AutoMod DM Messages');
  for(const key of AUTOMOD_RULE_KEYS)m.addComponents(textInput(`dm_${key}`,AUTOMOD_RULES[key].title.replace(/^\S+\s/,''),config.dmMessages[key],{required:false,style:TextInputStyle.Paragraph,maxLength:1000}));
  return m;
}
function buildLogChannelPanel(){
  return {embeds:[createEmbed('🤖 Set AutoMod Log Channel','Select the text channel where AutoMod logs should be sent.')],components:[row(new ChannelSelectMenuBuilder().setCustomId('admin:selectautomodlog').setPlaceholder('Choose a text channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)),row(backButton('admin:channel:automodlog'))]};
}
const parsePositive=(v,f,min=1,max=1000)=>{const n=Number.parseInt(String(v),10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):f;};
const parseList=v=>[...new Set(String(v||'').split(',').map(x=>x.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'')).filter(Boolean))].slice(0,100);
async function updatePanel(i,p){ if(i.deferred||i.replied)await i.editReply(p); else await i.update(p); return true; }
async function handleAutomodModal(i){
  if(i.customId==='admin:automod:dmmessage:modal'){
    const c=getAutomodConfig(i.guild.id), dmMessages={...c.dmMessages};
    for(const key of AUTOMOD_RULE_KEYS){const value=i.fields.getTextInputValue(`dm_${key}`).trim();dmMessages[key]=value||DEFAULT_DM_MESSAGES[key];}
    saveAutomodConfig(i.guild.id,{...c,dmMessages}); await i.reply({content:'✅ AutoMod DM messages saved.',flags:64}); return true;
  }
  const m=i.customId.match(/^admin:automod:rule:([^:]+):modal$/); if(!m||!AUTOMOD_RULES[m[1]])return false;
  const k=m[1],c=getAutomodConfig(i.guild.id),r={...c[k]};
  if(k==='antiSpam'){r.maxMessages=parsePositive(i.fields.getTextInputValue('maxMessages'),r.maxMessages,2,100);r.intervalSeconds=parsePositive(i.fields.getTextInputValue('intervalSeconds'),r.intervalSeconds,1,3600);}
  if(k==='antiLinks'){r.allowStaff=i.fields.getTextInputValue('allowStaff').trim().toLowerCase()!=='false';r.allowedDomains=parseList(i.fields.getTextInputValue('allowedDomains'));r.deniedDomains=parseList(i.fields.getTextInputValue('deniedDomains'));}
  if(k==='badWords')r.words=parseList(i.fields.getTextInputValue('words'));
  if(k==='caps'){r.percent=parsePositive(i.fields.getTextInputValue('percent'),r.percent,1,100);r.minLength=parsePositive(i.fields.getTextInputValue('minLength'),r.minLength,1,500);}
  if(k==='mentions')r.maxMentions=parsePositive(i.fields.getTextInputValue('maxMentions'),r.maxMentions,1,100);
  saveAutomodConfig(i.guild.id,{...c,[k]:r}); await i.reply({content:`✅ ${AUTOMOD_RULES[k].title} settings saved.`,flags:64}); return true;
}
async function handleAutomodInteraction(i){
  const id=String(i.customId||'');
  if(!(id.startsWith('admin:automod')||id==='admin:setautomodlog'||id==='admin:selectautomodlog'||id==='admin:channel:automodlog')) return false;
  const n=getMemberDisplayName(i);
  if(i.isModalSubmit?.()) return handleAutomodModal(i);
  if(i.isChannelSelectMenu?.()&&id==='admin:selectautomodlog'){setLogChannelId(i.guild.id,i.values?.[0]||null);return updatePanel(i,buildAutomodConfigurePanel(i.guild,n));}
  if(i.isStringSelectMenu?.()){
    const m=id.match(/^admin:automod:rule:([^:]+):actions$/);if(!m||!AUTOMOD_RULES[m[1]])return false;
    const k=m[1],c=getAutomodConfig(i.guild.id),r={...c[k],actions:normalizeActions(i.values,c[k].actions)};saveAutomodConfig(i.guild.id,{...c,[k]:r});return updatePanel(i,buildAutomodRulePanel(i.guild,k,n));
  }
  if(!i.isButton?.()) return false;
  if(id==='admin:automod') return updatePanel(i,buildAutomodPanel(i.guild,n));
  if(id==='admin:automod:configure') return updatePanel(i,buildAutomodConfigurePanel(i.guild,n));
  if(id==='admin:setautomodlog'||id==='admin:channel:automodlog') return updatePanel(i,buildLogChannelPanel());
  if(id==='admin:automod:dmmessage'){await i.showModal(buildDmMessagesModal(getAutomodConfig(i.guild.id)));return true;}
  if(id==='admin:automod:toggle'||id==='admin:automod:dm'){const c=getAutomodConfig(i.guild.id);saveAutomodConfig(i.guild.id,{...c,...(id.endsWith(':toggle')?{enabled:!c.enabled}:{dmUser:c.dmUser===false})});return updatePanel(i,buildAutomodConfigurePanel(i.guild,n));}
  if(id==='admin:automod:reset'){saveAutomodConfig(i.guild.id,defaults());return updatePanel(i,buildAutomodConfigurePanel(i.guild,n));}
  const rm=id.match(/^admin:automod:rule:([^:]+)(?::(toggle|edit))?$/);
  if(rm&&AUTOMOD_RULES[rm[1]]){const k=rm[1],a=rm[2];if(!a)return updatePanel(i,buildAutomodRulePanel(i.guild,k,n));const c=getAutomodConfig(i.guild.id),r={...c[k]};if(a==='edit'){await i.showModal(buildRuleModal(k,r));return true;}r.enabled=!r.enabled;saveAutomodConfig(i.guild.id,{...c,[k]:r});return updatePanel(i,buildAutomodRulePanel(i.guild,k,n));}
  return false;
}

module.exports={AUTOMOD_RULES,AUTOMOD_ACTIONS,DEFAULT_DM_MESSAGES,getAutomodConfig,saveAutomodConfig,buildAutomodPanel,buildAutomodConfigurePanel,buildAutomodRulePanel,buildLogChannelPanel,handleAutomodInteraction};
