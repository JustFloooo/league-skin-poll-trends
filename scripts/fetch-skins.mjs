import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";
const OUT = resolve("data/skins.json");

const RARITY_MAP = {
  kTranscendent: "transcendent",
  kExalted: "exalted",
  kUltimate: "ultimate",
  kMythic: "mythic",
  kLegendary: "legendary",
  kEpic: "epic",
  kRare: "standard",
  kNoRarity: null,
};

function normalizeKey(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function splashUrl(path) {
  if (!path) return null;
  return "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/" +
    path.replace("/lol-game-data/assets/", "").toLowerCase();
}

async function main() {
  console.log("Fetching CommunityDragon skins...");
  const res = await fetch(`${CDRAGON}/skins.json`);
  const raw = await res.json();

  console.log("Fetching champion list...");
  const champRes = await fetch(`${CDRAGON}/champion-summary.json`);
  const champs = await champRes.json();
  const champById = new Map(champs.map((c) => [c.id, c.name]));

  const skins = {};
  for (const skin of Object.values(raw)) {
    if (skin.isBase) {
      const champId = Math.floor(skin.id / 1000);
      const champion = champById.get(champId) ?? null;
      if (champion) {
        skins["original " + normalizeKey(champion)] = {
          name: skin.name,
          champion,
          rarity: null,
          isLegacy: false,
          splash: splashUrl(skin.uncenteredSplashPath),
          tile: splashUrl(skin.tilePath),
        };
      }
      continue;
    }
    const rarity = RARITY_MAP[skin.rarity] ?? null;
    const champId = Math.floor(skin.id / 1000);
    const champion = champById.get(champId) ?? null;
    const fullKey = normalizeKey(skin.name);
    const entry = {
      name: skin.name,
      champion,
      rarity,
      isLegacy: skin.isLegacy || false,
      splash: splashUrl(skin.uncenteredSplashPath),
      tile: splashUrl(skin.tilePath),
    };
    skins[fullKey] = entry;
  }

  await mkdir("data", { recursive: true });
  await writeFile(OUT, JSON.stringify(skins, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(skins).length} skins to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
