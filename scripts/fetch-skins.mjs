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

function cdnUrl(path) {
  if (!path) return null;
  return "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/" +
    path.replace("/lol-game-data/assets/", "").toLowerCase();
}

async function main() {
  console.log("Fetching CommunityDragon skins...");
  const raw = await fetch(`${CDRAGON}/skins.json`).then((r) => r.json());

  console.log("Fetching champion list...");
  const champs = await fetch(`${CDRAGON}/champion-summary.json`).then((r) => r.json());
  const champById = new Map(champs.map((c) => [c.id, c.name]));

  console.log("Fetching skin lines...");
  const lines = await fetch(`${CDRAGON}/skinlines.json`).then((r) => r.json());
  const lineById = new Map(lines.map((l) => [l.id, l.name]));

  const skins = {};
  for (const skin of Object.values(raw)) {
    const champId = Math.floor(skin.id / 1000);
    const champion = champById.get(champId) ?? null;
    const rarity = RARITY_MAP[skin.rarity] ?? null;
    const skinLine = skin.skinLines?.[0]?.id ? lineById.get(skin.skinLines[0].id) ?? null : null;

    const entry = {
      name: skin.name,
      champion,
      rarity,
      isLegacy: skin.isLegacy || false,
      splash: cdnUrl(skin.uncenteredSplashPath),
      splashCentered: cdnUrl(skin.splashPath),
      tile: cdnUrl(skin.tilePath),
      description: skin.description || null,
      skinLine,
      chromas: skin.chromas?.length ?? 0,
    };

    if (skin.isBase) {
      if (champion) skins["original " + normalizeKey(champion)] = entry;
    } else {
      skins[normalizeKey(skin.name)] = entry;
    }
  }

  await mkdir("data", { recursive: true });
  await writeFile(OUT, JSON.stringify(skins, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(skins).length} skins to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
