const fs = require('node:fs');
const path = require('node:path');

module.exports = (client) => {
  const eventsPath = path.join(__dirname, '..', 'events');

  if (!fs.existsSync(eventsPath)) {
    console.warn('[WARNING] No events folder found.');
    return;
  }

  const eventCategories = fs.readdirSync(eventsPath);

  for (const category of eventCategories) {
    const categoryPath = path.join(eventsPath, category);

    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const eventFiles = fs
      .readdirSync(categoryPath)
      .filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
      const filePath = path.join(categoryPath, file);
      const event = require(filePath);

      if (!event?.name || !event?.execute) {
        console.warn(`[WARNING] Event at ${filePath} is missing "name" or "execute".`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }

      console.log(`[EVENT] Loaded ${event.name} from ${category}/${file}`);
    }
  }
};