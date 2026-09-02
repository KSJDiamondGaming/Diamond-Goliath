'use strict';

const fs = require('node:fs');
const path = 'src/core/administration/mod/panel.js';
let s = fs.readFileSync(path, 'utf8');

const actionsOld = `    finalButtons.push(new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'view_analytics')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_dashboard:${'${id}'}:analytics\`).setLabel('📊 Analytics').setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:${'${id}'}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));`;
const actionsNew = `    finalButtons.push(new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:${'${id}'}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'view_analytics')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_dashboard:${'${id}'}:analytics\`).setLabel('📊 Analytics').setStyle(ButtonStyle.Secondary));`;

const analyticsOld = `    finalButtons.push(new ButtonBuilder().setCustomId(\`mod_dashboard:${'${returnId}'}:actions\`).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    finalButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_refresh:${'${context.analyticsWindow || \'30d\'}'}:${'${context.analyticsMode || \'overview\'}'}:${'${context.analyticsModeratorId || \'none\'}'}:${'${returnId}'}\`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:${'${returnId}'}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));`;
const analyticsNew = `    finalButtons.push(new ButtonBuilder().setCustomId(\`mod_dashboard:${'${returnId}'}:actions\`).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:${'${returnId}'}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));
    finalButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_refresh:${'${context.analyticsWindow || \'30d\'}'}:${'${context.analyticsMode || \'overview\'}'}:${'${context.analyticsModeratorId || \'none\'}'}:${'${returnId}'}\`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary));`;

if (!s.includes(actionsOld)) throw new Error('Actions navigation block not found');
if (!s.includes(analyticsOld)) throw new Error('Analytics navigation block not found');
s = s.replace(actionsOld, actionsNew).replace(analyticsOld, analyticsNew);
fs.writeFileSync(path, s);
console.log('Standardised moderation final navigation rows.');
