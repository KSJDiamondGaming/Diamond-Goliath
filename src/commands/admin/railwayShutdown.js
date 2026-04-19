const { SlashCommandBuilder } = require('discord.js');
const { exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const state = require('../../utils/utility/state');

const PROJECT_ID =
  process.env.RAILWAY_PROJECT_ID || '12c36909-d3c9-40b6-9c72-3f73f60a0e6a';
const ENVIRONMENT_ID =
  process.env.RAILWAY_ENVIRONMENT_ID || '6888799b-8703-448e-97d3-e5aa15e57e0e';
const SERVICE_NAME = process.env.RAILWAY_SERVICE_NAME || 'Diamond Goliath';
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

function runRailwayCommand(command) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        env: process.env,
        windowsHide: true,
        shell: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          error.command = command;
          reject(error);
          return;
        }

        resolve({ stdout, stderr, command });
      }
    );
  });
}

async function linkRailwayProject(cliPath) {
  const command = `"${cliPath}" link -p "${PROJECT_ID}" -e "${ENVIRONMENT_ID}" -s "${SERVICE_NAME}"`;
  return runRailwayCommand(command);
}

async function shutdownRailway(cliPath) {
  const command = `"${cliPath}" down -s "${SERVICE_NAME}" -e "${ENVIRONMENT_NAME}" -y`;
  return runRailwayCommand(command);
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

    await interaction.deferReply();

    const isActive = state.toggle();
    const cliPath = getRailwayCliPath();

    if (isActive) {
      try {
        await interaction.editReply('🟢 Bot is now ONLINE');
      } catch (error) {
        console.error('❌ Failed to send online response:', error);
      }

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

    try {
      await interaction.editReply('🔴 Shutting down Railway deployment...');
    } catch (error) {
      console.error('❌ Failed to send shutdown response:', error);
      state.toggle();
      return;
    }

    try {
      await interaction.client.user.setPresence({
        activities: [{ name: 'Maintenance Mode' }],
        status: 'dnd',
      });
    } catch (error) {
      console.error('❌ Failed to update bot presence:', error);
    }

    try {
      console.log('🚂 Railway CLI path:', cliPath);

      const linkResult = await linkRailwayProject(cliPath);
      if (linkResult.stdout?.trim()) {
        console.log('🚂 Railway link stdout:', linkResult.stdout.trim());
      }
      if (linkResult.stderr?.trim()) {
        console.warn('⚠️ Railway link stderr:', linkResult.stderr.trim());
      }

      const downResult = await shutdownRailway(cliPath);
      if (downResult.stdout?.trim()) {
        console.log('🚂 Railway down stdout:', downResult.stdout.trim());
      }
      if (downResult.stderr?.trim()) {
        console.warn('⚠️ Railway down stderr:', downResult.stderr.trim());
      }

      await interaction.followUp({
        content: `✅ Railway deployment removed for \`${SERVICE_NAME}\` in \`${ENVIRONMENT_NAME}\`.`,
      });

      setTimeout(() => {
        console.log('🛑 Shutting down bot process...');
        process.exit(0);
      }, 1500);
    } catch (error) {
      console.error('❌ Railway CLI shutdown failed:', error);
      console.error('❌ CLI path tried:', cliPath);
      console.error('❌ Command tried:', error.command || 'unknown');

      if (error.stdout?.trim()) {
        console.error('❌ Railway stdout:', error.stdout.trim());
      }

      if (error.stderr?.trim()) {
        console.error('❌ Railway stderr:', error.stderr.trim());
      }

      state.toggle();

      try {
        await interaction.followUp({
          content: '❌ Railway shutdown failed. Check the bot logs for the exact CLI error.',
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