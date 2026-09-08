'use strict';
const fs = require('fs');
const path = 'src/core/security/protection/quarantine.js';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText) {
  if (!s.includes(oldText)) throw new Error(`Patch anchor not found: ${oldText.slice(0, 120)}`);
  s = s.replace(oldText, newText);
}

replaceOnce(
`async function ensureQuarantineRole(guild, options = {}) {
  if (!guild) throw new Error('Missing guild.');
  const state = getQuarantineState(guild.id);
  const roleName = resolveConfiguredRoleName(guild.id, options);
  let role = state.roleId ? guild.roles.cache.get(String(state.roleId)) : null;
  if (!role) role = guild.roles.cache.find((entry) => entry.name === roleName) || null;

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: 0x991b1b,
      permissions: [],
      reason: 'Goliath quarantine containment role',
    });
  } else if (!role.managed && role.name !== roleName) {
    await role.setName(roleName, 'Synchronising Goliath quarantine role configuration').catch(() => null);
  }

  if (role.managed) throw new Error('Configured quarantine role is managed by an integration.');

  if (state.roleId !== role.id || state.roleName !== role.name) {`,
`async function ensureQuarantineRole(guild, options = {}) {
  if (!guild) throw new Error('Missing guild.');
  const state = getQuarantineState(guild.id);
  const roleName = resolveConfiguredRoleName(guild.id, options);
  const botMember = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Goliath is missing Manage Roles.');
  }

  let role = state.roleId ? guild.roles.cache.get(String(state.roleId)) : null;

  // A quarantine role above Goliath cannot be used for channel overwrites or member role changes.
  // Ignore stale/unmanageable configured roles and reuse only a role Goliath can actually edit.
  if (role && (role.managed || !role.editable)) {
    console.warn(\`[QuarantineSystem] Configured quarantine role \${role.id} is not editable; replacing it below the bot hierarchy.\`);
    role = null;
  }
  if (!role) {
    role = guild.roles.cache.find((entry) => entry.name === roleName && !entry.managed && entry.editable) || null;
  }

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: 0x991b1b,
      permissions: [],
      reason: 'Goliath quarantine containment role',
    });
  } else if (role.name !== roleName) {
    await role.setName(roleName, 'Synchronising Goliath quarantine role configuration').catch(() => null);
  }

  if (role.managed || !role.editable) {
    throw new Error('Goliath cannot manage the configured quarantine role. Move Goliath above it or allow Goliath to create a replacement.');
  }

  if (state.roleId !== role.id || state.roleName !== role.name) {`
);

replaceOnce(
`  if (failed) {
    console.warn(\`[QuarantineSystem] Isolation sync incomplete in \${guild.id}: \${failed} channel(s) failed.\`);
  }
  return { success: failed === 0, roleId: role.id, roleName: role.name, updated, failed, failures };`,
`  if (failed) {
    const firstError = failures[0]?.error || null;
    console.warn(\`[QuarantineSystem] Isolation sync incomplete in \${guild.id}: \${failed} channel(s) failed.\${firstError ? \` First error: \${firstError}\` : ''}\`);
    return {
      success: false,
      reason: \`\${failed} channel(s) failed\${firstError ? \`; first error: \${firstError}\` : ''}\`,
      roleId: role.id,
      roleName: role.name,
      updated,
      failed,
      failures,
    };
  }
  return { success: true, roleId: role.id, roleName: role.name, updated, failed: 0, failures };`
);

fs.writeFileSync(path, s);
console.log('Quarantine role hierarchy repair applied.');
