# Goliath Media Tools

Media Tools is a Plus-or-higher utility workspace for creating Discord-ready GIFs, emojis and role icons.

## Runtime requirements

### Sharp

Sharp is used for emoji and role icon resizing/export.

```bash
npm install
```

Sharp is listed in `package.json`, so a normal install should include it.

### FFmpeg

FFmpeg is used for real GIF conversion, video trimming, FPS control and resizing.

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

Verify:

```bash
ffmpeg -version
```

## Health check

Run:

```bash
npm run media:deps
```

The dashboard also exposes processor status on the Media Tools page and via:

```txt
GET /api/media/:guildId/status
```

## Storage

By default, generated media is stored under:

```txt
data/guilds/{guildId}/media/
```

Override with:

```bash
GOLIATH_MEDIA_ROOT=/absolute/path/to/media/root
```

## Discord commands

After deployment, sync slash commands:

```bash
npm run sync:commands:dev
npm run sync:commands:beta
npm run sync:commands:production
```

Media commands:

```txt
/media list
/media gif-send
/media emoji-install
/media role-icon-set
```

## Premium gating

Media Tools uses the feature key:

```txt
media.tools
```

It is available on Plus, Pro and Lifetime plans.

## Fallback behavior

If FFmpeg is missing, GIF Maker saves the original upload as a fallback.

If Sharp is missing, Emoji Maker saves the original upload as a fallback.

This prevents startup crashes, but production should install both dependencies for full functionality.
