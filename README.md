# League Skin Poll Trends

A static viewer for League of Legends best-skin poll trends across yearly Reddit and StrawPoll data.

The site lets you browse each champion's yearly winners, compare normalized winner share over time, inspect full poll results, and spot sample-size issues without pooling unrelated yearly polls.

## Data

The crawler reads public Reddit posts, extracts each StrawPoll link, then pulls embedded StrawPoll result data into `data/polls.js`.

Included source years:

- 2025
- 2024
- 2023
- 2022
- 2021

Older text-only polls are normalized against newer image polls where possible, so historic options can reuse current skin images.

## Refresh Data

```bash
node scripts/crawl-polls.mjs
```

The crawler writes `data/polls.js`, which the static site reads directly.

## Run Locally

You can open `index.html` directly, or serve the folder locally:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

## Publish on GitHub Pages

This repo can be hosted directly with GitHub Pages from the repository root.

Recommended Pages settings:

- Source: deploy from branch
- Branch: `master`
- Folder: `/ (root)`

## Disclaimer

League Skin Poll Trends was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

League of Legends, champion names, skin names, and related artwork are owned by Riot Games. Poll data comes from public Reddit and StrawPoll pages. This project is not endorsed by Riot Games, Reddit, or StrawPoll.

The MIT license in this repository applies only to this project's original code and documentation. It does not grant rights to Riot Games intellectual property or third-party poll content.
