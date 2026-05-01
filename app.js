const data = window.POLL_DATA ?? { polls: [], summaries: [], years: [], failures: [] };
const latestYear = Math.max(...(data.years ?? [2025]));
let skinDB = {};
fetch("data/skins.json").then(r => r.json()).then(d => { skinDB = d; render(); }).catch(() => {});

function lookupSkin(option, champion) {
  const key = option.normalizedKey ?? "";
  const champ = (champion ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const withChamp = key + " " + champ;
  // Handle year variants like "prestige blood moon 2022" -> "prestige blood moon aatrox 2022"
  const yearMatch = key.match(/^(.+)\s(\d{4})$/);
  const withChampYear = yearMatch ? yearMatch[1] + " " + champ + " " + yearMatch[2] : null;
  return skinDB[withChamp] ?? skinDB[withChampYear] ?? skinDB[key] ?? null;
}

function rarityBadge(option, champion) {
  const skin = lookupSkin(option, champion);
  if (!skin?.rarity) return "";
  return `<img class="rarity-gem" src="assets/rarity/${skin.rarity}.png" alt="${skin.rarity}" title="${skin.rarity}">`;
}
const state = {
  query: "",
  year: latestYear,
  sort: "champion",
  filter: "all",
  selectedChampion: null,
};

const els = {
  search: document.querySelector("#search"),
  year: document.querySelector("#year"),
  sort: document.querySelector("#sort"),
  filter: document.querySelector("#filter"),
  summary: document.querySelector("#summary"),
  list: document.querySelector("#championList"),
  subreddit: document.querySelector("#subreddit"),
  championTitle: document.querySelector("#championTitle"),
  pollLink: document.querySelector("#pollLink"),
  resultsLink: document.querySelector("#resultsLink"),
  totalVotes: document.querySelector("#totalVotes"),
  winnerShare: document.querySelector("#winnerShare"),
  margin: document.querySelector("#margin"),
  lastVote: document.querySelector("#lastVote"),
  insights: document.querySelector("#insights"),
  winnerPanel: document.querySelector("#winnerPanel"),
  trendPanel: document.querySelector("#trendPanel"),
  history: document.querySelector("#history"),
  options: document.querySelector("#options"),
};

const formatter = new Intl.NumberFormat();
const percent = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

const byChampion = new Map();
for (const poll of data.polls) {
  if (!byChampion.has(poll.champion)) byChampion.set(poll.champion, []);
  byChampion.get(poll.champion).push(poll);
}

for (const history of byChampion.values()) {
  history.sort((a, b) => b.year - a.year);
}

const summariesByChampion = new Map(data.summaries.map((summary) => [summary.champion, summary]));

function optionShare(option, poll) {
  return poll.totalVotes ? option.votes / poll.totalVotes : 0;
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function sampleClass(totalVotes) {
  if (totalVotes >= 300) return "large";
  if (totalVotes >= 100) return "solid";
  if (totalVotes >= 25) return "thin";
  return "low";
}

function sampleLabel(totalVotes) {
  if (totalVotes >= 300) return "large sample";
  if (totalVotes >= 100) return "solid sample";
  if (totalVotes >= 25) return "thin sample";
  return "low sample";
}

function skinLabel(option) {
  return option?.normalizedName || option?.name || "Unknown";
}

function selectedYear() {
  return state.year === "all" ? "all" : Number(state.year);
}

function pollForYear(history, year) {
  if (year === "all") return history[0] ?? null;
  return history.find((poll) => poll.year === year) ?? null;
}

function currentPollForChampion(champion) {
  return pollForYear(byChampion.get(champion) ?? [], selectedYear());
}

function matchesQuery(champion) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;

  const history = byChampion.get(champion) ?? [];
  return (
    champion.toLowerCase().includes(query) ||
    history.some(
      (poll) =>
        poll.subreddit?.toLowerCase().includes(query) ||
        poll.options.some(
          (option) =>
            option.name.toLowerCase().includes(query) ||
            skinLabel(option).toLowerCase().includes(query),
        ),
    )
  );
}

function matchesFilter(champion) {
  const summary = summariesByChampion.get(champion);
  const poll = currentPollForChampion(champion);

  if (state.filter === "changed") return summary?.changedFromPrevious;
  if (state.filter === "stable") return (summary?.consensusWins ?? 0) >= Math.min(3, summary?.yearCount ?? 0);
  if (state.filter === "landslides") return (poll?.winnerShare ?? 0) >= 0.45;
  if (state.filter === "close") return poll ? poll.marginShare <= 0.05 : false;
  if (state.filter === "low") return poll ? poll.totalVotes < 25 : false;
  return true;
}

function visibleChampions() {
  const champions = [...byChampion.keys()]
    .filter((champion) => {
      if (!matchesQuery(champion) || !matchesFilter(champion)) return false;
      return selectedYear() === "all" || Boolean(currentPollForChampion(champion));
    })
    .sort((a, b) => {
      const pollA = currentPollForChampion(a);
      const pollB = currentPollForChampion(b);
      const summaryA = summariesByChampion.get(a);
      const summaryB = summariesByChampion.get(b);

      if (state.sort === "votes") {
        return (pollB?.totalVotes ?? 0) - (pollA?.totalVotes ?? 0) || a.localeCompare(b);
      }
      if (state.sort === "winnerShare") {
        return (pollB?.winnerShare ?? 0) - (pollA?.winnerShare ?? 0) || a.localeCompare(b);
      }
      if (state.sort === "margin") {
        return (pollA?.marginShare ?? 1) - (pollB?.marginShare ?? 1) || a.localeCompare(b);
      }
      if (state.sort === "changes") {
        return Number(Boolean(summaryB?.changedFromPrevious)) - Number(Boolean(summaryA?.changedFromPrevious)) || a.localeCompare(b);
      }
      if (state.sort === "years") {
        return (summaryB?.yearCount ?? 0) - (summaryA?.yearCount ?? 0) || a.localeCompare(b);
      }
      if (state.sort === "updated") {
        return new Date(pollB?.lastVoteAt ?? 0) - new Date(pollA?.lastVoteAt ?? 0) || a.localeCompare(b);
      }
      return a.localeCompare(b);
    });

  return champions;
}

function selectChampion(champion) {
  state.selectedChampion = champion;
  if (window.innerWidth <= 880) document.getElementById("sidebarToggle").checked = true;
  render();
}

function selectDetailYear(year) {
  state.year = year === "all" ? "all" : Number(year);
  els.year.value = String(state.year);
  render();
}

function renderYearSelect() {
  els.year.innerHTML = [
    `<option value="all">Trend</option>`,
    ...data.years.map((year) => `<option value="${year}">${year}</option>`),
  ].join("");
  els.year.value = String(state.year);
}

function renderSummary(champions) {
  const polls = champions.map(currentPollForChampion).filter(Boolean);
  const totalVotes = polls.reduce((sum, poll) => sum + poll.totalVotes, 0);
  const changed = champions.filter((champion) => summariesByChampion.get(champion)?.changedFromPrevious).length;

  els.summary.innerHTML = `
    <div><strong>${formatter.format(champions.length)}</strong>champions</div>
    <div><strong>${formatter.format(totalVotes)}</strong>${selectedYear() === "all" ? "latest votes" : "votes"}</div>
    <div><strong>${formatter.format(changed)}</strong>changed</div>
  `;
}

function renderList(champions) {
  if (!champions.length) {
    els.list.innerHTML = '<p class="empty">No champions match this view.</p>';
    return;
  }

  els.list.innerHTML = champions
    .map((champion) => {
      const poll = currentPollForChampion(champion);
      const summary = summariesByChampion.get(champion);
      const years = summary?.yearCount ? `${summary.yearCount} yrs` : "";
      const badgeClass = poll ? sampleClass(poll.totalVotes) : "low";
      return `
        <button class="champion-button ${
          champion === state.selectedChampion ? "active" : ""
        }" type="button" data-champion="${champion}">
          <span>
            <strong>${champion}</strong>
            <small>${poll?.winner ? skinLabel(poll.winner) : poll?.error ?? "No result"}</small>
          </span>
          <span class="vote-pill ${selectedYear() === "all" ? "" : badgeClass}">${selectedYear() === "all" ? years : formatter.format(poll?.totalVotes ?? 0)}</span>
        </button>
      `;
    })
    .join("");

  els.list.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectChampion(button.dataset.champion));
  });
}

function renderTrend(champion, history) {
  const winnerNames = [...new Set(history.map((poll) => poll.winner?.normalizedName ?? poll.winner?.name).filter(Boolean))];
  const latest = history[0];
  const previous = history[1];
  const status =
    latest && previous && latest.winner?.normalizedKey !== previous.winner?.normalizedKey
      ? `Changed from ${skinLabel(previous.winner)} to ${skinLabel(latest.winner)}`
      : latest
        ? `${latest.winner ? skinLabel(latest.winner) : "Unknown"} is holding`
        : "No trend data";

  els.trendPanel.innerHTML = `
    <div class="trend-copy">
      <p class="eyebrow">Trend</p>
      <h3>${status}</h3>
      <p>${history.length} yearly snapshots, ${winnerNames.length} different winner${winnerNames.length === 1 ? "" : "s"}. Vote counts are not pooled; bars compare each year's winner share.</p>
    </div>
    <div class="trend-bars">
      ${history
        .map(
          (poll) => `
            <button class="trend-row" type="button" data-year="${poll.year}">
              <span>${poll.year}</span>
              <strong>${poll.winner ? skinLabel(poll.winner) : "No result"}</strong>
              <em>${percent.format(poll.winnerShare ?? 0)}</em>
              <i style="--width: ${(poll.winnerShare ?? 0) * 100}%"></i>
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  els.trendPanel.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectDetailYear(button.dataset.year));
  });
}

function championInsights(champion, history) {
  const latest = history[0];
  const previous = history[1];
  const rows = [];

  if (latest && previous && latest.winner?.normalizedKey !== previous.winner?.normalizedKey) {
    rows.push({
      label: "Winner changed",
      value: `${previous.winner ? skinLabel(previous.winner) : "Unknown"} -> ${latest.winner ? skinLabel(latest.winner) : "Unknown"}`,
    });
  }

  if (latest) {
    rows.push({
      label: sampleLabel(latest.totalVotes),
      value: `${formatter.format(latest.totalVotes)} votes in ${latest.year}`,
      tone: sampleClass(latest.totalVotes),
    });
  }

  if (latest?.marginShare <= 0.05) {
    rows.push({
      label: "Close race",
      value: `${formatter.format(latest.marginVotes)} votes separate first and second`,
      tone: "thin",
    });
  }

  const strongest = [...history].sort((a, b) => b.winnerShare - a.winnerShare)[0];
  if (strongest) {
    rows.push({
      label: "Strongest year",
      value: `${strongest.year}: ${strongest.winner ? skinLabel(strongest.winner) : "Unknown"} at ${percent.format(strongest.winnerShare)}`,
    });
  }

  const summary = summariesByChampion.get(champion);
  if (summary?.consensusWinner) {
    rows.push({
      label: "Consensus",
      value: `${summary.consensusWinner} won ${summary.consensusWins}/${summary.yearCount} years`,
    });
  }

  return rows.slice(0, 5);
}

function globalInsights() {
  const latestPolls = [...byChampion.keys()].map(currentPollForChampion).filter(Boolean);
  const changed = latestPolls
    .filter((poll) => summariesByChampion.get(poll.champion)?.changedFromPrevious)
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .slice(0, 4);
  const close = latestPolls
    .filter((poll) => poll.marginShare <= 0.05)
    .sort((a, b) => a.marginShare - b.marginShare)
    .slice(0, 4);
  const low = latestPolls
    .filter((poll) => poll.totalVotes < 25)
    .sort((a, b) => a.totalVotes - b.totalVotes)
    .slice(0, 4);
  const stable = data.summaries
    .filter((summary) => summary.yearCount >= 4 && summary.consensusWins === summary.yearCount)
    .sort((a, b) => b.totalVotesAcrossYears - a.totalVotesAcrossYears)
    .slice(0, 4);

  return [
    {
      title: "Changed Winners",
      rows: changed.map((poll) => `${poll.champion}: ${poll.winner ? skinLabel(poll.winner) : "Unknown"}`),
    },
    {
      title: "Closest Races",
      rows: close.map((poll) => `${poll.champion}: ${formatter.format(poll.marginVotes)} vote margin`),
    },
    {
      title: "Low Samples",
      rows: low.map((poll) => `${poll.champion}: ${formatter.format(poll.totalVotes)} votes`),
    },
    {
      title: "Stable Winners",
      rows: stable.map((summary) => `${summary.champion}: ${summary.consensusWinner}`),
    },
  ];
}

function renderInsights(champion, history) {
  if (!champion || !history.length) {
    els.insights.innerHTML = globalInsights()
      .map(
        (section) => `
          <article class="insight-card">
            <span>${section.title}</span>
            <strong>${section.rows.join(" / ") || "None"}</strong>
          </article>
        `,
      )
      .join("");
    return;
  }

  els.insights.innerHTML = championInsights(champion, history)
    .map(
      (item) => `
        <article class="insight-card ${item.tone ?? ""}">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderHistory(history, selectedPoll) {
  els.history.innerHTML = history
    .map(
      (poll) => `
        <button class="history-item ${poll.year === selectedPoll?.year ? "active" : ""}" type="button" data-year="${poll.year}">
          <span>${poll.year}</span>
          <strong>${poll.winner ? skinLabel(poll.winner) : poll.error ?? "No result"}</strong>
          <small>${formatter.format(poll.totalVotes)} votes - ${percent.format(poll.winnerShare ?? 0)} - ${sampleLabel(poll.totalVotes)}</small>
        </button>
      `,
    )
    .join("");

  els.history.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectDetailYear(button.dataset.year));
  });
}

function renderDetail(champion) {
  const history = byChampion.get(champion) ?? [];
  const poll = pollForYear(history, selectedYear()) ?? history[0];

  if (!champion || !poll) {
    els.championTitle.textContent = "No champion selected";
    els.subreddit.textContent = "";
    els.options.innerHTML = "";
    els.winnerPanel.innerHTML = "";
    els.trendPanel.innerHTML = "";
    els.insights.innerHTML = "";
    els.history.innerHTML = "";
    return;
  }

  const winner = poll.winner;
  const runnerUp = poll.runnerUp;
  els.subreddit.textContent = `${poll.year} - ${poll.subreddit || "source post"}`;
  els.championTitle.textContent = champion;
  els.pollLink.href = poll.pollUrl;
  els.resultsLink.href = poll.resultsUrl ?? poll.pollUrl;
  els.totalVotes.textContent = formatter.format(poll.totalVotes);
  els.winnerShare.textContent = percent.format(poll.winnerShare ?? 0);
  els.margin.textContent = `${formatter.format(poll.marginVotes ?? 0)} votes`;
  els.lastVote.textContent = formatDate(poll.lastVoteAt);

  renderInsights(champion, history);
  renderTrend(champion, history);
  renderHistory(history, poll);

  if (!winner) {
    els.winnerPanel.innerHTML = `<p class="empty">${poll.error ?? "No result data found."}</p>`;
    els.options.innerHTML = "";
    return;
  }

  const splashSkin = lookupSkin(winner, champion);
  const splashUrl = splashSkin?.splash ?? null;
  const winnerImg = splashUrl ?? winner.imageUrl;

  els.winnerPanel.innerHTML = `
    ${winnerImg ? `<img class="winner-splash" src="${winnerImg}" alt="${skinLabel(winner)}" loading="eager" />` : '<div class="no-image"></div>'}
    <div class="winner-copy">
      <p class="eyebrow">${poll.year} winner</p>
      <h3>${skinLabel(winner)}</h3>
      <p>${formatter.format(winner.votes)} votes · ${percent.format(optionShare(winner, poll))}${
        runnerUp ? ` · ${formatter.format(poll.marginVotes)} votes ahead of ${skinLabel(runnerUp)}` : ""
      }</p>
      <span class="sample-badge ${sampleClass(poll.totalVotes)}">${sampleLabel(poll.totalVotes)}</span>
    </div>
    ${rarityBadge(winner, champion)}
  `;

  els.options.innerHTML = poll.options
    .map((option) => {
      const share = optionShare(option, poll);
      return `
        <article class="option-card" data-option-index="${option.rank - 1}" role="button" tabindex="0">
          ${option.imageUrl ? `<img src="${option.imageUrl}" alt="${skinLabel(option)}" loading="lazy" />` : '<div class="no-image small"></div>'}
          <div>
            <h3>${option.rank}. ${skinLabel(option)}</h3>
            <div class="option-meta">
              <span>${formatter.format(option.votes)} votes</span>
              <span>${percent.format(share)}</span>
            </div>
            <div class="bar" aria-hidden="true"><span style="--width: ${share * 100}%"></span></div>
          </div>
          ${rarityBadge(option, champion)}
        </article>
      `;
    })
    .join("");

  els.options.querySelectorAll(".option-card").forEach((card) => {
    const idx = Number(card.dataset.optionIndex);
    card.addEventListener("click", () => openSkinModal(poll.options[idx], champion, poll));
  });
}

function render() {
  const champions = visibleChampions();
  if (!champions.includes(state.selectedChampion)) {
    state.selectedChampion = champions[0] ?? null;
  }

  renderSummary(champions);
  renderList(champions);
  renderDetail(state.selectedChampion);
}

renderYearSelect();

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

els.year.addEventListener("change", (event) => {
  state.year = event.target.value === "all" ? "all" : Number(event.target.value);
  render();
});

els.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

els.filter.addEventListener("change", (event) => {
  state.filter = event.target.value;
  render();
});

render();


const modal = document.getElementById("skinModal");
const modalSplash = modal.querySelector(".skin-modal-splash");
const modalBody = modal.querySelector(".skin-modal-body");

function openSkinModal(option, champion, poll) {
  const skin = lookupSkin(option, champion);
  const img = skin?.splashCentered ?? skin?.splash ?? option.imageUrl;
  modalSplash.src = img ?? "";
  modalSplash.alt = skinLabel(option);
  modalSplash.style.display = img ? "" : "none";

  const tags = [];
  if (skin?.rarity) tags.push(`<span class="modal-tag"><img src="assets/rarity/${skin.rarity}.png" alt="">${skin.rarity[0].toUpperCase() + skin.rarity.slice(1)}</span>`);
  if (skin?.skinLine) tags.push(`<span class="modal-tag">${skin.skinLine}</span>`);
  if (skin?.isLegacy) tags.push(`<span class="modal-tag">Legacy Vault</span>`);
  if (skin?.chromas) tags.push(`<span class="modal-tag">${skin.chromas} chromas</span>`);
  if (!skin?.rarity && option.normalizedKey === "original") tags.push(`<span class="modal-tag">Base Skin</span>`);

  // Build trend across all years for this skin
  const history = (byChampion.get(champion) ?? []).map((p) => {
    const match = p.options.find((o) => o.normalizedKey === option.normalizedKey);
    return match ? { year: p.year, votes: match.votes, total: p.totalVotes, rank: match.rank, count: p.options.length } : null;
  }).filter(Boolean).sort((a, b) => b.year - a.year);

  const trendRows = history.map((h) =>
    `<div class="modal-trend-row">
      <span>${h.year}</span>
      <strong>#${h.rank}</strong>
      <span>${formatter.format(h.votes)} votes</span>
      <span>${percent.format(h.votes / h.total)}</span>
    </div>`
  ).join("");

  modalBody.innerHTML = `
    <h3>${skin?.name ?? skinLabel(option)}</h3>
    ${tags.length ? `<div class="modal-meta">${tags.join("")}</div>` : ""}
    ${skin?.description ? `<p class="modal-desc">${skin.description}</p>` : ""}
    ${trendRows ? `<div class="modal-trend">${trendRows}</div>` : ""}
  `;

  modal.hidden = false;
}

function closeSkinModal() {
  modal.hidden = true;
  modalSplash.src = "";
}

modal.querySelector(".skin-modal-backdrop").addEventListener("click", closeSkinModal);
modal.querySelector(".skin-modal-close").addEventListener("click", closeSkinModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeSkinModal(); });
