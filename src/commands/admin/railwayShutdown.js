const { SlashCommandBuilder } = require('discord.js');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const state = require('../../utils/utility/state');

const SERVICE_NAME = process.env.RAILWAY_SERVICE_NAME || 'goliath';
const ENVIRONMENT_NAME =
  process.env.RAILWAY_ENVIRONMENT_NAME || 'production';

function getRailwayCliPath() {
  const binName = process.platform === 'win32' ? 'railway.cmd' : 'railway';
  const localPath = path.join(process.cwd(), 'node_modules', '.bin', binName);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  return binName;
}

function runRailwayDown() {
  return new Promise((resolve, reject) => {
    const cliPath = getRailwayCliPath();

    execFile(
      cliPath,
      ['down', '-s', SERVICE_NAME, '-e', ENVIRONMENT_NAME, '-y'],
      {
        env: process.env,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          error.cliPath = cliPath;
          reject(error);
          return;
        }

        resolve({ stdout, stderr, cliPath });
      }
    );
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('railwayshutdown')
    .setDescription('Shut down the Railway deployment and enable maintenance mode'),

  async execute(interaction) {
    if (!state.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const isActive = state.toggle();

    if (isActive) {
      await interaction.reply('🟢 Bot is now ONLINE');

      try {
        await interaction.client.user.setPresence({
          activities: [{ name: 'Serving the server' }],
          status: 'online',
        });
      } catch (error) {
        console.error('❌ Failed to update bot presence:', error);
      }

      return;
    }

    await interaction.reply('🔴 Shutting down Railway deployment...');

    try {
      await interaction.client.user.setPresence({
        activities: [{ name: 'Maintenance Mode' }],
        status: 'dnd',
      });
    } catch (error) {
      console.error('❌ Failed to update bot presence:', error);
    }

    try {
      const { stdout, stderr, cliPath } = await runRailwayDown();

      console.log('🚂 Railway CLI path:', cliPath);

      if (stdout?.trim()) {
        console.log('🚂 Railway CLI stdout:', stdout.trim());
      }

      if (stderr?.trim()) {
        console.warn('⚠️ Railway CLI stderr:', stderr.trim());
      }

      try {
        await interaction.followUp({
          content: `✅ Railway deployment removed for \`${SERVICE_NAME}\` in \`${ENVIRONMENT_NAME}\`.`,
          ephemeral: true,
        });
      } catch (error) {
        console.error('❌ Failed to send Railway success follow-up:', error);
      }

      setTimeout(() => {
        console.log('🛑 Shutting down bot process...');
        process.exit(0);
      }, 1500);
    } catch (error) {
      console.error('❌ Railway CLI shutdown failed:', error);
      console.error('❌ CLI path tried:', error.cliPath || 'unknown');

      if (error.stdout?.trim()) {
        console.error('❌ Railway stdout:', error.stdout.trim());
      }

      if (error.stderr?.trim()) {
        console.error('❌ Railway stderr:', error.stderr.trim());
      }

      state.toggle();

      try {
        await interaction.followUp({
          content:
            '❌ Railway shutdown failed. The Railway CLI is missing or not available in this runtime.',
          ephemeral: true,
        });
      } catch (followUpError) {
        console.error('❌ Failed to send Railway failure follow-up:', followUpError);
      }

      try {
        await interaction.client.user.setPresence({
          activities: [{ name: 'Serving the server' }],
          status: 'online',
        });
      } catch (presenceError) {
        console.error('❌ Failed to restore bot presence:', presenceError);
      }
    }
  },
};