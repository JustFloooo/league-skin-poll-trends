# League Skin Poll Trends

Static viewer for League of Legends best-skin poll results across yearly Reddit/StrawPoll threads.

## Refresh Data

```bash
node scripts/crawl-polls.mjs
```

The crawler writes `data/polls.js`, which the static site reads directly.

## Publish

This repo can be hosted directly with GitHub Pages from the repository root.
