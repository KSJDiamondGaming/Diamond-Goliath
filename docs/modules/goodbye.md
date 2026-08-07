# Goodbye

Goodbye is consolidated into three canonical implementation files.

```text
src/modules/messageStudio/goodbye/
├── goodbye.js
├── goodbyePanel.js
└── goodbyeDeparture.js
```

- `goodbye.js` — configuration, template assignment, public API, analytics and health.
- `goodbyePanel.js` — every visible embed, button, menu and Goodbye interaction.
- `goodbyeDeparture.js` — departure classification, public departure messages and member DMs.

The HTTP router lives at `src/server/routes/goodbye.js` and is not a module implementation file.

No compatibility layers, wrappers, bridges or duplicate Goodbye implementations are retained.
