const fs = require('node:fs');
const path = require('node:path');

function getEventFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) return results;

  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      results = results.concat(getEventFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  }

  return results;
}

module.exports = function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const eventFiles = getEventFiles(eventsPath);

  for (const filePath of eventFiles) {
    delete require.cache[require.resolve(filePath)];
    const event = require(filePath);

    if (!event?.name || !event?.execute) {
      console.warn(`[WARNING] Invalid event file: ${filePath}`);
      continue;
    }

    const eventName = event.name === 'ready' ? 'clientReady' : event.name;
    const handler = (...args) => event.execute(...args, client);

    if (event.once) {
      client.once(eventName, handler);
    } else {
      client.on(eventName, handler);
    }

    console.log(`📌 Loaded event: ${eventName}`);
  }
};