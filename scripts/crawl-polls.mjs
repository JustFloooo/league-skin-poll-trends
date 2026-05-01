import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SOURCES = [
  {
    year: 2025,
    label: "2025",
    redditUrl:
      "https://www.reddit.com/r/leagueoflegends/comments/1q3n8ll/best_skin_per_champion_2025/",
  },
  {
    year: 2024,
    label: "2024",
    redditUrl:
      "https://www.reddit.com/r/leagueoflegends/comments/1hriirt/best_skin_per_champion_end_of_2024_edition/",
  },
  {
    year: 2023,
    label: "2023",
    redditUrl:
      "https://www.reddit.com/r/leagueoflegends/comments/18hmgj2/best_skin_per_champion_end_of_2023_edition/",
  },
  {
    year: 2022,
    label: "2022",
    redditUrl: "https://www.reddit.com/r/leagueoflegends/comments/124kb99/best_skins_per_champ_2022/",
  },
  {
    year: 2021,
    label: "2021",
    redditUrl: "https://www.reddit.com/r/leagueoflegends/comments/wehp4g/best_skins_per_champ_20215/",
  },
];

const OUT_FILE = resolve("data/polls.js");
const CONCURRENCY = 8;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function decodeHtml(value) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function redditJsonUrl(url) {
  return `${url.replace(/\/?$/, "")}/.json`;
}

function normalizePollUrl(url) {
  const match = url.match(/https:\/\/strawpoll\.com\/(?:polls\/)?([A-Za-z0-9]+)/);
  if (!match) return url;
  return `https://strawpoll.com/${match[1]}`;
}

async function fetchText(url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "league-skin-poll-viewer/1.0 (+https://reddit.com/r/leagueoflegends)",
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(900 * attempt);
      }
    }
  }

  throw lastError;
}

function parseMarkdownLinkCell(cell) {
  const link = cell.match(/https:\/\/strawpoll\.com\/(?:polls\/)?[A-Za-z0-9]+/);
  return link ? normalizePollUrl(link[0]) : null;
}

function cleanChampionName(name) {
  return decodeHtml(name)
    .replace(/\\_/g, "_")
    .replace(/\*\*/g, "")
    .replace(/:$/, "")
    .trim();
}

function parseChampionTable(markdown, source) {
  const rows = [];
  const seen = new Set();

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      const champion = cleanChampionName(cells[0] ?? "");
      const pollUrl = parseMarkdownLinkCell(cells[1] ?? "");
      const subreddit = decodeHtml((cells[2] ?? "").replace(/\[([^\]]+)\]\([^)]+\)/, "$1"));

      if (pollUrl && champion && champion !== "Champion" && !/^[:-]+$/.test(champion)) {
        const key = `${source.year}:${champion}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ ...source, champion, pollUrl, subreddit });
        }
      }
      continue;
    }

    const lineMatch = trimmed.match(
      /^([^:\n]+):\s*(?:\[[^\]]+\]\()?((?:https:\/\/strawpoll\.com\/(?:polls\/)?[A-Za-z0-9]+))/,
    );

    if (lineMatch) {
      const champion = cleanChampionName(lineMatch[1]);
      const pollUrl = normalizePollUrl(lineMatch[2]);
      const key = `${source.year}:${champion}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ ...source, champion, pollUrl, subreddit: "" });
      }
    }
  }

  return rows;
}

function extractPollJson(html) {
  const marker = "this.$store.poll.update(strawpoll.toCamelCaseKeys(";
  const start = html.indexOf(marker);

  if (start === -1) {
    throw new Error("Poll data marker not found");
  }

  let index = start + marker.length;
  while (html[index] !== "{") {
    index += 1;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let cursor = index; cursor < html.length; cursor += 1) {
    const char = html[cursor];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(index, cursor + 1));
      }
    }
  }

  throw new Error("Poll data JSON was not closed");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripChampionName(name, champion) {
  const championForms = [
    champion,
    champion.replace(/['.]/g, ""),
    champion.replace(/\s*&\s*/g, " "),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  let stripped = name;
  for (const form of championForms) {
    stripped = stripped.replace(new RegExp(`\\s+${escapeRegex(form)}(?=\\s*(?:\\(\\d{4}\\))?$)`, "i"), "");
  }

  return stripped.trim();
}

function normalizeSkinKey(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeOption(optionName, champion) {
  let display = stripChampionName(decodeHtml(optionName ?? ""), champion)
    .replace(/\s+/g, " ")
    .trim();

  if (/^(classic|original)$/i.test(display)) {
    display = "Original";
  }

  const yearVariant = display.match(/\((\d{4})\)\s*$/)?.[1] ?? null;
  const withoutVariant = display.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  const isPrestige = /\bprestige\b/i.test(withoutVariant);

  if (isPrestige) {
    const base = withoutVariant
      .replace(/\bprestige\b/gi, "")
      .replace(/\bedition\b/gi, "")
      .trim()
      .replace(/\s+/g, " ");
    display = `Prestige ${base}${yearVariant ? ` (${yearVariant})` : ""}`.trim();
  } else if (yearVariant) {
    display = `${withoutVariant} (${yearVariant})`;
  }

  return {
    normalizedName: display,
    normalizedKey: normalizeSkinKey(display),
  };
}

function normalizePoll(row, rawPoll) {
  const options = [...(rawPoll.poll_options ?? [])]
    .map((option) => {
      const normalized = normalizeOption(option.value ?? "", row.champion);
      return {
        id: option.id,
        name: decodeHtml(option.value ?? ""),
        normalizedName: normalized.normalizedName,
        normalizedKey: normalized.normalizedKey,
        votes: option.vote_count ?? 0,
        position: option.position ?? 0,
        imageUrl: option.media?.url ?? null,
        imageSourceYear: option.media?.url ? row.year : null,
      };
    })
    .sort((a, b) => b.votes - a.votes || a.position - b.position)
    .map((option, index) => ({ ...option, rank: index + 1 }));

  const totalVotes =
    rawPoll.poll_meta?.vote_count ??
    options.reduce((sum, option) => sum + option.votes, 0);
  const winner = options[0] ?? null;
  const runnerUp = options[1] ?? null;

  return {
    year: row.year,
    label: row.label,
    champion: row.champion,
    title: decodeHtml(rawPoll.title ?? row.champion),
    pollUrl: row.pollUrl,
    resultsUrl: `https://strawpoll.com/${rawPoll.id}/results`,
    redditUrl: row.redditUrl,
    subreddit: row.subreddit,
    totalVotes,
    participantCount: rawPoll.poll_meta?.participant_count ?? totalVotes,
    viewCount: rawPoll.poll_meta?.view_count ?? null,
    lastVoteAt: rawPoll.poll_meta?.last_vote_at
      ? new Date(rawPoll.poll_meta.last_vote_at * 1000).toISOString()
      : null,
    updatedAt: rawPoll.updated_at
      ? new Date(rawPoll.updated_at * 1000).toISOString()
      : null,
    winner,
    runnerUp,
    winnerShare: totalVotes && winner ? winner.votes / totalVotes : 0,
    marginVotes: winner && runnerUp ? winner.votes - runnerUp.votes : winner?.votes ?? 0,
    marginShare:
      totalVotes && winner && runnerUp ? (winner.votes - runnerUp.votes) / totalVotes : 0,
    options,
  };
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => runWorker()),
  );

  return results;
}

async function fetchRowsForSource(source) {
  console.log(`Fetching Reddit table for ${source.label}...`);
  const reddit = JSON.parse(await fetchText(redditJsonUrl(source.redditUrl)));
  const post = reddit[0].data.children[0].data;
  const rows = parseChampionTable(post.selftext, source);

  if (!rows.length) {
    throw new Error(`No StrawPoll rows found for ${source.label}`);
  }

  return {
    ...source,
    title: post.title,
    postCreatedAt: new Date(post.created_utc * 1000).toISOString(),
    rows,
  };
}

function buildChampionSummaries(polls) {
  const byChampion = Map.groupBy(polls, (poll) => poll.champion);

  return [...byChampion.entries()]
    .map(([champion, championPolls]) => {
      const history = [...championPolls].sort((a, b) => a.year - b.year);
      const latest = history.at(-1);
      const winnerCounts = new Map();

      for (const poll of history) {
        if (!poll.winner) continue;
        const key = poll.winner.normalizedKey || poll.winner.normalizedName || poll.winner.name;
        winnerCounts.set(key, (winnerCounts.get(key) ?? 0) + 1);
      }

      const consensus = [...winnerCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const consensusName =
        consensus &&
        history
          .flatMap((poll) => poll.options)
          .find((option) => option.normalizedKey === consensus[0])?.normalizedName;
      const changedFromPrevious =
        history.length > 1 &&
        history.at(-1)?.winner?.normalizedKey !== history.at(-2)?.winner?.normalizedKey;

      return {
        champion,
        years: history.map((poll) => poll.year),
        yearCount: history.length,
        totalVotesAcrossYears: history.reduce((sum, poll) => sum + poll.totalVotes, 0),
        latestYear: latest?.year ?? null,
        latestWinner: latest?.winner ?? null,
        latestWinnerShare: latest?.winnerShare ?? 0,
        consensusWinner: consensusName ?? consensus?.[0] ?? null,
        consensusWins: consensus?.[1] ?? 0,
        changedFromPrevious,
      };
    })
    .sort((a, b) => a.champion.localeCompare(b.champion));
}

function canonicalizeChampionNames(polls) {
  const preferred = new Map();

  for (const poll of [...polls].sort((a, b) => b.year - a.year)) {
    const key = poll.champion.toLowerCase();
    if (!preferred.has(key)) {
      preferred.set(key, poll.champion);
    }
  }

  return polls.map((poll) => ({
    ...poll,
    champion: preferred.get(poll.champion.toLowerCase()) ?? poll.champion,
  }));
}

function hydrateOptionImages(polls) {
  const imageBySkin = new Map();

  for (const poll of [...polls].sort((a, b) => b.year - a.year)) {
    for (const option of poll.options) {
      if (!option.imageUrl || !option.normalizedKey) continue;
      const key = `${poll.champion.toLowerCase()}|${option.normalizedKey}`;
      if (!imageBySkin.has(key)) {
        imageBySkin.set(key, {
          imageUrl: option.imageUrl,
          imageSourceYear: poll.year,
          imageSourceName: option.name,
        });
      }
    }
  }

  return polls.map((poll) => ({
    ...poll,
    options: poll.options.map((option) => {
      if (option.imageUrl || !option.normalizedKey) return option;
      const fallback = imageBySkin.get(`${poll.champion.toLowerCase()}|${option.normalizedKey}`);
      return fallback ? { ...option, ...fallback, imageIsFallback: true } : option;
    }),
  })).map((poll) => ({
    ...poll,
    winner: poll.options[0] ?? null,
    runnerUp: poll.options[1] ?? null,
  }));
}

async function loadExistingData() {
  try {
    const raw = await readFile(OUT_FILE, "utf8");
    const json = raw.replace(/^window\.POLL_DATA\s*=\s*/, "").replace(/;\s*$/, "");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const yearFlag = args.indexOf("--year");
  if (yearFlag !== -1 && args[yearFlag + 1]) {
    return { year: Number(args[yearFlag + 1]) };
  }
  return { year: null };
}

async function main() {
  const { year: onlyYear } = parseArgs();
  const startedAt = new Date().toISOString();

  const activeSources = onlyYear
    ? SOURCES.filter((s) => s.year === onlyYear)
    : SOURCES;

  if (onlyYear && !activeSources.length) {
    throw new Error(`No source configured for year ${onlyYear}`);
  }

  if (onlyYear) console.log(`Updating only ${onlyYear} polls...`);

  const sources = await Promise.all(activeSources.map(fetchRowsForSource));
  const rows = sources.flatMap((source) => source.rows);
  const failures = [];

  console.log(`Found ${rows.length} polls across ${sources.length} source post(s).`);
  const freshPolls = await runPool(rows, async (row, index) => {
    try {
      const html = await fetchText(row.pollUrl);
      const rawPoll = extractPollJson(html);
      const poll = normalizePoll(row, rawPoll);
      console.log(
        `${String(index + 1).padStart(3, " ")}/${rows.length} ${row.label} ${row.champion}: ${
          poll.winner?.name ?? "no options"
        } (${poll.winner?.votes ?? 0}/${poll.totalVotes})`,
      );
      return poll;
    } catch (error) {
      failures.push({ ...row, error: error.message });
      console.warn(`${row.label} ${row.champion}: ${error.message}`);
      return {
        year: row.year,
        label: row.label,
        champion: row.champion,
        pollUrl: row.pollUrl,
        redditUrl: row.redditUrl,
        subreddit: row.subreddit,
        error: error.message,
        totalVotes: 0,
        options: [],
      };
    }
  });

  let allPolls = freshPolls;
  let allSources = sources;

  if (onlyYear) {
    const existing = await loadExistingData();
    if (existing) {
      const keptPolls = (existing.polls ?? []).filter((p) => p.year !== onlyYear);
      allPolls = [...keptPolls, ...freshPolls];
      const keptSources = (existing.sources ?? []).filter((s) => s.year !== onlyYear);
      allSources = [...keptSources, ...sources];
    }
  }

  const canonicalPolls = hydrateOptionImages(canonicalizeChampionNames(allPolls));
  const sortedPolls = canonicalPolls.sort((a, b) => b.year - a.year || a.champion.localeCompare(b.champion));
  const hydratedImageCount = sortedPolls
    .flatMap((poll) => poll.options)
    .filter((option) => option.imageIsFallback).length;
  const payload = {
    fetchedAt: new Date().toISOString(),
    startedAt,
    sources: allSources.map(({ rows, ...source }) => ({
      ...source,
      pollCount: rows?.length ?? source.pollCount,
    })),
    years: SOURCES.map((source) => source.year).sort((a, b) => b - a),
    count: sortedPolls.length,
    hydratedImageCount,
    failures,
    summaries: buildChampionSummaries(sortedPolls),
    polls: sortedPolls,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    `window.POLL_DATA = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8",
  );

  console.log(`Wrote ${OUT_FILE}`);
  if (failures.length) {
    console.log(`${failures.length} polls failed; see window.POLL_DATA.failures.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
