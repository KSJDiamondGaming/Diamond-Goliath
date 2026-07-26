from pathlib import Path
import re

root = Path.cwd()
base = root / 'src/modules/messageStudio/goodbye'

# ---------------------------------------------------------------------------
# goodbyeDeparture.js: one departure implementation for public logs and DMs.
# ---------------------------------------------------------------------------
sender = (base / 'departureTemplateSender.js').read_text(encoding='utf-8')
dm = (base / 'goodbyeDepartureDm.js').read_text(encoding='utf-8')

sender = re.sub(r"^'use strict';\s*", '', sender, count=1)
sender = sender.replace('module.exports = {', 'senderApi = {', 1)

dm = re.sub(r"^'use strict';\s*", '', dm, count=1)
dm = dm.replace("const { formatDuration } = require('./departureTemplateSender');", 'const { formatDuration } = senderApi;')
dm = dm.replace('module.exports = {', 'dmApi = {', 1)

departure = """'use strict';

/**
 * Canonical Goodbye departure layer.
 * Owns departure classification, public departure delivery and member DMs.
 */

let senderApi;
{
""" + '\n'.join('  ' + line if line else '' for line in sender.strip().splitlines()) + """
}

let dmApi;
{
""" + '\n'.join('  ' + line if line else '' for line in dm.strip().splitlines()) + """
}

module.exports = {
  ...senderApi,
  ...dmApi,
  sender: senderApi,
  dm: dmApi,
};
"""
(base / 'goodbyeDeparture.js').write_text(departure, encoding='utf-8', newline='\n')

# ---------------------------------------------------------------------------
# goodbyePanel.js: all visible Discord UI and all Goodbye interactions.
# ---------------------------------------------------------------------------
panel_path = base / 'goodbyePanel.js'
panel = panel_path.read_text(encoding='utf-8')
dm_panel = (base / 'goodbyeDmPanel.js').read_text(encoding='utf-8')

panel = panel.replace("const departureDm = require('./goodbyeDepartureDm');", "const departureDm = require('./goodbyeDeparture');")
panel = panel.replace("const { buildGoodbyeDmPanel } = require('./goodbyeDmPanel');\n", '')

dm_panel = re.sub(r"^'use strict';\s*", '', dm_panel, count=1)
dm_panel = re.sub(r"const \{[\s\S]*?\} = require\('discord\.js'\);\s*", '', dm_panel, count=1)
dm_panel = dm_panel.replace("const departureDm = require('./goodbyeDepartureDm');\n", '')
dm_panel = re.sub(r"module\.exports = \{ buildGoodbyeDmPanel \};\s*$", 'return buildGoodbyeDmPanel;', dm_panel)

insert_at = panel.index('const selections = new Map();')
wrapped_dm_panel = "const buildGoodbyeDmPanel = (() => {\n" + '\n'.join('  ' + line if line else '' for line in dm_panel.strip().splitlines()) + "\n})();\n\n"
panel = panel[:insert_at] + wrapped_dm_panel + panel[insert_at:]
panel_path.write_text(panel, encoding='utf-8', newline='\n')

# ---------------------------------------------------------------------------
# Move HTTP routing out of the module implementation directory.
# ---------------------------------------------------------------------------
old_route = base / 'goodbyeRoute.js'
new_route = root / 'src/server/routes/goodbye.js'
route = old_route.read_text(encoding='utf-8')
route = route.replace("require('./goodbye')", "require('../../modules/messageStudio/goodbye/goodbye')")
route = route.replace("require('./goodbyeDepartureDm')", "require('../../modules/messageStudio/goodbye/goodbyeDeparture')")
new_route.write_text(route, encoding='utf-8', newline='\n')

# ---------------------------------------------------------------------------
# Repoint every external dependency to canonical files.
# ---------------------------------------------------------------------------
for path in list((root / 'src').rglob('*.js')) + [root / 'server.js', root / 'scripts/goliath.js']:
    if not path.exists() or path in [base / 'goodbyeDeparture.js']:
        continue
    text = path.read_text(encoding='utf-8')
    original = text
    text = text.replace('departureTemplateSender', 'goodbyeDeparture')
    text = text.replace('goodbyeDepartureDm', 'goodbyeDeparture')
    text = text.replace('goodbyeDmPanel', 'goodbyePanel')
    text = text.replace("./src/modules/messageStudio/goodbye/goodbyeRoute", "./src/server/routes/goodbye")
    text = text.replace('src/modules/messageStudio/goodbye/goodbyeRoute.js', 'src/server/routes/goodbye.js')
    if text != original:
        path.write_text(text, encoding='utf-8', newline='\n')

# Remove retired implementations. No wrappers or bridges remain.
for legacy in [
    base / 'departureTemplateSender.js',
    base / 'goodbyeDepartureDm.js',
    base / 'goodbyeDmPanel.js',
    base / 'goodbyeRoute.js',
]:
    legacy.unlink(missing_ok=True)

# Canonical documentation.
(root / 'docs/modules/goodbye.md').write_text("""# Goodbye

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
""", encoding='utf-8', newline='\n')

# Temporary build files remove themselves before the final commit.
for temporary in [
    root / '.goliath/goodbye_refactor.py',
    root / '.github/workflows/goodbye-refactor.yml',
]:
    temporary.unlink(missing_ok=True)
