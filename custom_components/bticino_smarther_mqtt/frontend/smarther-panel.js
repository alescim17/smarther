/** Automatic Smarther sidebar panel. Local assets; no startup service calls. */
const SOURCE = "bticino_mqtt_legacy_bridge";
const INFO_COMMAND = "bticino_smarther_mqtt/panel_info";
const ENTITY_DOMAINS = {
  climate: "climate", program: "select", humidity: "sensor", heating: "sensor",
  active_program: "sensor", boost_end: "sensor", last_message: "sensor",
  boost_30: "button", boost_60: "button", boost_90: "button", cancel_boost: "button",
};
const TEXT = {
  en: {
    climate: "Climate", temperature: "Temperature", apply: "Apply", mode: "Mode",
    off: "Off", heat: "Heat", auto: "Auto", program: "Program", boost: "Boost",
    cancel: "Cancel", cancelLabel: "Cancel Boost and resume the schedule",
    humidity: "Humidity", heating: "Heating", idle: "Idle", unknown: "Unknown",
    unavailable: "Unavailable", readOnly: "Read-only", stale: "Stale telemetry",
    fresh: "Live telemetry", noLive: "Waiting for live telemetry", retained: "Retained snapshot only", notLive: "Telemetry not live",
    end: "Boost ends", noBoost: "No active Boost", ago: "min ago", pending: "Sending…",
    failed: "Command refused or failed. Check telemetry and integration options.",
    invalid: "Check the selected value before applying.",
    loading: "Loading thermostats…", none: "No visible thermostats. Check availability, panel visibility and your entity permissions.",
    loadFailed: "Thermostats could not be loaded.", retry: "Retry", menu: "Open sidebar",
    current: "Current temperature", target: "Target", setpoint: "Target temperature", views: "Thermostat views", statistics: "Statistics", info: "Info", decrease: "Decrease target temperature", increase: "Increase target temperature",
    boostHelp: "Choose a duration, then start Boost.", startBoost: "Start Boost", controls: "Controls", lastLive: "Last live update", day: "Last 24 hours", week: "Last 7 days", today: "today", recorded: "Recorded minutes · gaps are excluded", minimum: "Minimum", maximum: "Maximum", loadingHistory: "Loading history…", noHistory: "History is unavailable.", emptyHistory: "No recorded data for this period.",
  },
  it: {
    climate: "Clima", temperature: "Temperatura", apply: "Applica", mode: "Modalità",
    off: "Off", heat: "Manuale", auto: "Auto", program: "Programma", boost: "Boost",
    cancel: "Annulla", cancelLabel: "Annulla Boost e riprendi il programma",
    humidity: "Umidità", heating: "Riscaldamento", idle: "Inattivo", unknown: "Sconosciuto",
    unavailable: "Non disponibile", readOnly: "Sola lettura", stale: "Telemetria obsoleta",
    fresh: "Telemetria live", noLive: "In attesa di telemetria live", retained: "Solo dati retained", notLive: "Telemetria non live",
    end: "Fine Boost", noBoost: "Nessun Boost attivo", ago: "min fa", pending: "Invio…",
    failed: "Comando rifiutato o non riuscito. Controlla telemetria e opzioni dell’integrazione.",
    invalid: "Controlla il valore selezionato prima di applicarlo.",
    loading: "Caricamento termostati…", none: "Nessun termostato visibile. Controlla disponibilità, visibilità pannello e permessi sulle entità.",
    loadFailed: "Impossibile caricare i termostati.", retry: "Riprova", menu: "Apri barra laterale",
    current: "Temperatura attuale", target: "Imposta", setpoint: "Temperatura desiderata", views: "Viste termostato", statistics: "Statistiche", info: "Info", decrease: "Riduci temperatura desiderata", increase: "Aumenta temperatura desiderata",
    boostHelp: "Scegli la durata, poi avvia Boost.", startBoost: "Avvia Boost", controls: "Comandi", lastLive: "Ultimo aggiornamento live", day: "Ultime 24 ore", week: "Ultimi 7 giorni", today: "oggi", recorded: "Minuti registrati · dati mancanti esclusi", minimum: "Minima", maximum: "Massima", loadingHistory: "Caricamento storico…", noHistory: "Storico non disponibile.", emptyHistory: "Nessun dato registrato nel periodo.",
  },
};

function words(hass) {
  return TEXT[String(hass?.language || navigator.language || "en").startsWith("it") ? "it" : "en"];
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function entityMap(input = {}) {
  const result = {};
  for (const [key, domain] of Object.entries(ENTITY_DOMAINS)) {
    const id = input[key];
    if (typeof id === "string" && new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(id)) result[key] = id;
  }
  return result;
}

function usable(state) {
  return Boolean(state && !["unknown", "unavailable"].includes(state.state));
}

function controlAvailable(state) {
  // A ButtonEntity is "unknown" until its first press; that is not unavailability.
  // A SelectEntity may also have choices before its current option is known.
  return Boolean(state && state.state !== "unavailable");
}

function smartherState(hass, id) {
  const state = hass?.states?.[id];
  return state?.attributes?.source === SOURCE ? state : undefined;
}

function telemetry(state, now = Date.now()) {
  if (!usable(state)) return { key: "unavailable" };
  const attributes = state?.attributes || {};
  const stamp = Date.parse(attributes.last_live_message || "");
  const limit = Number(attributes.control_max_age_seconds);
  if (!Number.isFinite(stamp)) return { key: attributes.last_message_retained ? "retained" : "noLive" };
  const age = (now - stamp) / 1000;
  return {
    key: Number.isFinite(limit) && limit > 0 && age >= -60 && age <= limit ? "fresh" : "stale",
    minutes: Math.max(0, Math.floor(age / 60)),
  };
}

function gate(hass, id) {
  const state = smartherState(hass, id);
  if (!usable(state)) return "unavailable";
  if (state.attributes.controls_enabled !== true) return "readOnly";
  const status = telemetry(state).key;
  return status === "fresh" ? "ready" : status;
}

function sameDevice(hass, climateId, entityId) {
  if (climateId === entityId) return true;
  const climate = hass.entities?.[climateId];
  const other = hass.entities?.[entityId];
  return Boolean(climate?.device_id && other?.device_id === climate.device_id);
}

// The bridge reports an end time, not an original duration. Keep an explicit
// 0–90 minute scale rather than guessing a 30/60/90 minute starting duration.
function boostCountdown(hass, ids, now = Date.now()) {
  const state = smartherState(hass, ids.climate), endState = hass.states[ids.boost_end];
  if (telemetry(state, now).key !== "fresh" || state.attributes.vendor_mode !== "BOOST"
    || !usable(endState) || !sameDevice(hass, ids.climate, ids.boost_end)) return null;
  const end = Date.parse(endState.state);
  if (!Number.isFinite(end)) return null;
  const minutes = Math.max(0, (end - now) / 60000);
  return { minutes, percent: Math.min(100, minutes / 90 * 100) };
}

function displayState(hass, id, unknown) {
  const state = hass.states?.[id];
  if (!usable(state)) return unknown;
  return hass.formatEntityState ? hass.formatEntityState(state) : `${state.state}${state.attributes.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}`;
}

function localDate(hass, value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return words(hass).unknown;
  return new Intl.DateTimeFormat(hass.language || "en", {
    dateStyle: "short", timeStyle: "short", timeZone: hass.config?.time_zone,
  }).format(date);
}

const ICONS = {
  climate: "M8 3h8v4H8z M6 7h12v14H6z M10 11h4 M10 15h4",
  temperature: "M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0 M12 8v10",
  humidity: "M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13 M8 16a4 4 0 0 0 4 4",
  boost: "M13 2c2 6-3 6-1 10 1-2 3-3 4-5 5 6 4 14-4 15C3 21 3 14 7 9c-1 6 3 5 3 2 0-4 3-5 3-9",
  program: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16 M8 14h3 M8 17h7",
  statistics: "M4 21V11h4v10 M10 21V4h4v17 M16 21V8h4v13",
  info: "M12 8v.1 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  plus: "M12 5v14 M5 12h14", minus: "M5 12h14", check: "M5 12l4 4L19 6",
};
function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = svgNode("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: "icon" });
  svg.append(svgNode("path", { d: ICONS[name] || ICONS.climate, fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  return svg;
}
function number(value) {
  return ["number", "string"].includes(typeof value) && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}
function historyRows(rows = []) {
  return rows.map((row) => ({
    time: typeof row.lu === "number" ? row.lu * 1000 : Date.parse(row.last_updated || row.last_changed),
    state: row.s ?? row.state, attributes: row.a || row.attributes || {},
  })).filter((row) => Number.isFinite(row.time)).sort((a, b) => a.time - b.time);
}
function dayKey(time, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  return ["year", "month", "day"].map((part) => parts.find((p) => p.type === part).value).join("-");
}
function recordedHeating(rows, end, zone = "UTC") {
  const today = dayKey(end, zone);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return { day: date.toISOString().slice(0, 10), heating: 0, known: 0 };
  });
  const samples = historyRows(rows);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const live = Date.parse(sample.attributes.last_live_message || "");
    const limit = number(sample.attributes.control_max_age_seconds);
    const action = sample.attributes.hvac_action;
    if (["unknown", "unavailable"].includes(sample.state) || !["heating", "idle", "off"].includes(action)
      || !Number.isFinite(live) || !limit || limit <= 0) continue;
    let start = Math.max(sample.time, live);
    const stop = Math.min(samples[i + 1]?.time ?? end, end, live + limit * 1000);
    while (start < stop) {
      const key = dayKey(start, zone);
      let boundary = stop;
      if (dayKey(stop - 1, zone) !== key) {
        let low = start, high = stop;
        while (high - low > 1) {
          const middle = Math.floor((low + high) / 2);
          if (dayKey(middle, zone) === key) low = middle; else high = middle;
        }
        boundary = high;
      }
      const day = days.find((item) => item.day === key);
      if (day) {
        day.known += boundary - start;
        if (action === "heating") day.heating += boundary - start;
      }
      start = boundary;
    }
  }
  return days;
}

const FACE_STYLE = `
  :host { display:block; min-width:0; color:var(--primary-text-color,#242a30); font-family:var(--ha-font-family,Roboto,sans-serif); }
  * { box-sizing:border-box; }
  .shell { background:var(--card-background-color,#fff); border:1px solid var(--divider-color,#e6e8eb); border-radius:20px; box-shadow:0 4px 18px #00000007; overflow:hidden; --accent:#ee943d; }
  .head { display:flex; align-items:center; gap:12px; padding:19px 22px 0; }
  .brand { width:25px; height:25px; color:var(--accent); }
  h2 { font-size:16px; font-weight:600; margin:0; overflow-wrap:anywhere; letter-spacing:.1px; flex:1; }
  .mode-label { font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--secondary-text-color,#7a8189); }
  .body { display:grid; grid-template-columns:minmax(0,1fr) 6px 92px; min-height:326px; padding:14px 12px 10px 20px; gap:12px; }
  .view { min-width:0; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:0 4px 5px; }
  .dial { width:100%; max-width:300px; position:relative; aspect-ratio:260/230; }
  .dial svg { display:block; width:100%; height:100%; }
  .dial-face { position:absolute; inset:0; display:flex; align-items:center; flex-direction:column; justify-content:center; padding-top:10px; pointer-events:none; }
  .eyebrow { text-transform:uppercase; font-size:10px; letter-spacing:1.3px; color:var(--secondary-text-color,#8a9097); }
  .temperature { display:flex; align-items:flex-start; font-size:64px; font-weight:300; line-height:1.12; letter-spacing:-3px; margin:8px 0 4px; font-variant-numeric:tabular-nums; }
  .temperature small { font-size:23px; letter-spacing:0; padding:9px 0 0 5px; }
  .activity { display:flex; align-items:center; gap:5px; color:var(--accent); font-size:11px; }
  .activity .icon { width:14px; height:14px; }
  .target { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:-24px; position:relative; }
  button,input,select { font:inherit; color:inherit; }
  button { cursor:pointer; border:0; background:none; }
  button:disabled { opacity:.38; cursor:default; }
  button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .round { display:grid; place-items:center; width:36px; height:36px; border:1px solid var(--divider-color,#e4e7eb); border-radius:50%; background:var(--card-background-color,#fff); }
  .round .icon { width:15px; height:15px; }
  .target-value { text-align:center; }
  .target-value label { display:block; font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--secondary-text-color,#8a9097); margin-bottom:2px; }
  .target-value input { width:65px; padding:0; border:0; text-align:center; background:transparent; font-size:20px; font-weight:500; appearance:textfield; }
  input::-webkit-inner-spin-button,input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .target-value span { font-size:12px; }
  .apply { margin-top:9px; min-height:32px; border-radius:16px; padding:5px 18px; font-size:11px; background:var(--accent); color:#fff; }
  .apply:disabled { opacity:.4; }
  .modes { display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; justify-content:center; }
  .modes button { border-radius:16px; padding:7px 11px; font-size:10px; color:var(--secondary-text-color,#737b83); }
  .modes button[aria-pressed=true] { background:#ee943d18; color:#bc6b20; font-weight:600; }
  .boost-track { border-radius:4px; background:var(--divider-color,#f0f1f3); margin:12px 0; position:relative; overflow:hidden; }
  .boost-fill { position:absolute; bottom:0; left:0; width:100%; background:#e53935; border-radius:4px; }
  .rail { display:flex; flex-direction:column; justify-content:space-evenly; border-left:1px solid var(--divider-color,#f0f1f3); padding-left:8px; }
  .rail button { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px; min-height:48px; border-radius:11px; padding:6px 2px; color:var(--secondary-text-color,#8a919b); position:relative; }
  .rail button .icon { width:22px; height:22px; }
  .rail button span { font-size:9px; line-height:1.1; }
  .rail button[aria-pressed=true] { background:var(--secondary-background-color,#f7f8fa); color:var(--accent); }
  .rail button[data-view=humidity] { --tab:#75aeca; }
  .rail button[data-view=temperature] { --tab:#ee943d; }
  .rail button[data-view=statistics] { --tab:#87ad88; }
  .rail button[data-view=program] { --tab:#8c91b1; }
  .rail button .icon { color:var(--tab,currentColor); }
  .rail .badge { position:absolute; top:1px; right:8px; padding:2px 4px; background:#e57953; color:white; font-size:8px; border-radius:6px; }
  .footer { display:flex; flex-wrap:wrap; justify-content:space-between; gap:9px; padding:12px 20px; border-top:1px solid var(--divider-color,#f0f1f3); font-size:10px; color:var(--secondary-text-color,#7d858e); }
  .metric,.live { display:flex; align-items:center; gap:5px; }
  .metric .icon { width:14px; height:14px; color:#7daec3; }
  .dot { width:5px; height:5px; border-radius:50%; background:#cba060; flex-shrink:0; }
  .dot.fresh { background:#8bad83; }
  .blocked { color:var(--secondary-text-color,#8a9097); font-size:11px; text-align:center; margin:10px 0 0; }
  .view-title { width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; margin:8px 0 12px; }
  h3 { margin:0; font-weight:500; font-size:14px; }
  .period { font-size:9px; color:var(--secondary-text-color,#8a9097); }
  .chart { width:100%; min-height:140px; }
  .chart svg { width:100%; display:block; }
  .summary { width:100%; display:flex; justify-content:space-between; gap:8px; margin-top:12px; }
  .summary div { font-size:10px; color:var(--secondary-text-color,#8a9097); }
  .summary strong { display:block; color:var(--primary-text-color,#333); font-size:15px; font-weight:500; margin-top:4px; }
  .empty { font-size:11px; color:var(--secondary-text-color,#8a9097); text-align:center; padding:28px 8px; line-height:1.6; }
  .big { font-size:42px; font-weight:300; letter-spacing:-1px; margin:10px 0 4px; }
  .big small { font-size:15px; letter-spacing:0; color:var(--secondary-text-color,#8a9097); }
  .options { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:20px 0 10px; }
  .options button { border:1px solid var(--divider-color,#e5e7eb); border-radius:12px; padding:12px 15px; font-size:13px; }
  .options button[aria-pressed=true] { border-color:var(--accent); color:#c17a35; background:#ee943d10; }
  select { width:100%; max-width:240px; padding:12px; border-radius:10px; border:1px solid var(--divider-color,#e4e7eb); background:var(--card-background-color,#fff); margin:20px 0 10px; }
  .secondary { min-height:36px; margin-top:8px; font-size:11px; color:var(--secondary-text-color,#8a9097); }
  dl { width:100%; font-size:11px; line-height:1.6; margin:15px 0; }
  dt { color:var(--secondary-text-color,#8a9097); margin-top:10px; } dd { margin:2px 0 0; overflow-wrap:anywhere; }
  .error { color:var(--error-color,#c54d4d); padding:10px; font-size:11px; line-height:1.5; }
  @media(max-width:430px) { .head { padding:16px 16px 0; } .body { grid-template-columns:minmax(0,1fr) 5px 66px; gap:8px; padding:9px 8px 7px 12px; min-height:318px; } .rail { padding-left:4px; } .rail button span { font-size:8px; } .rail button .icon { width:20px; height:20px; } .temperature { font-size:49px; } .temperature small { font-size:17px; padding-top:7px; } .target { gap:7px; margin-top:-12px; } .target-value input { font-size:18px; width:55px; } .round { width:30px; height:30px; } .modes button { padding:7px 8px; } .footer { padding:11px 14px; gap:6px; } .view-title { flex-direction:column; align-items:flex-start; } .summary strong { font-size:13px; } }
`;

class SmartherThermostat extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: "open" }); this._view = "climate"; this._boostMinutes = 30; this._history = {}; this._historyLoading = new Set();
  }
  setConfig(config) {
    this._device = config.device;
    this._ids = entityMap(config.device.entities);
    this._signature = undefined;
    this._render();
  }
  set hass(hass) { this._hass = hass; this._render(); }
  connectedCallback() {
    this._timer = window.setInterval(() => { this._render(); if (["temperature", "humidity", "statistics"].includes(this._view)) this._loadHistory(); }, 15000);
    this._render();
  }
  disconnectedCallback() { window.clearInterval(this._timer); }
  _button(text, action, className = "") {
    const button = element("button", text, className); button.type = "button";
    button.addEventListener("click", action); return button;
  }
  _activate(view) { this._view = view; this._error = undefined; this._render(true); if (["temperature", "humidity", "statistics"].includes(view)) this._loadHistory(); }
  _updateBoostTrack(track, countdown) {
    if (!track) return;
    const t = words(this._hass), label = this._hass.language?.startsWith("it") ? "Boost · minuti residui · scala 0–90 min" : "Boost · remaining minutes · scale 0–90 min";
    const empty = smartherState(this._hass, this._ids.climate)?.attributes.vendor_mode === "BOOST" ? t.unknown : t.noBoost;
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", label);
    track.setAttribute("title", countdown ? `${label}: ${Math.ceil(countdown.minutes)}` : empty);
    track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "90");
    track.setAttribute("aria-valuetext", countdown ? `${Math.ceil(countdown.minutes)} min` : empty);
    track.setAttribute("aria-valuenow", String(Math.min(90, countdown?.minutes || 0)));
    const fill = element("div", undefined, "boost-fill");
    fill.setAttribute("style", `height:${countdown?.percent || 0}%`);
    track.replaceChildren(fill);
  }
  _render(force = false) {
    if (!this._hass || !this._ids || !this.isConnected) return;
    const state = smartherState(this._hass, this._ids.climate);
    const status = gate(this._hass, this._ids.climate);
    const countdown = boostCountdown(this._hass, this._ids);
    // Update the countdown even while a focused field preserves its draft.
    this._updateBoostTrack(this.shadowRoot.querySelector(".boost-track"), countdown);
    if (status !== "ready") this._draft = undefined;
    const signature = JSON.stringify([this._hass.language, this._view, this._draft, this._boostMinutes, this._busy, this._error,
      this._historyVersion, status, Math.floor(Date.now() / 15000), ...Object.values(this._ids).map(id => this._hass.states[id])]);
    if (!force && (signature === this._signature || (status === "ready" && !this._busy && !this._error
      && ["INPUT", "SELECT"].includes(this.shadowRoot.activeElement?.tagName)))) return;
    this._signature = signature;
    const t = words(this._hass), shell = element("article", undefined, "shell");
    const head = element("div", undefined, "head"), brand = icon("climate"); brand.classList.add("brand");
    head.append(brand, element("h2", this._device.title), element("span", t[state?.state] || t.unavailable, "mode-label"));
    const body = element("div", undefined, "body"), view = element("div", undefined, "view");
    const track = element("div", undefined, "boost-track"); this._updateBoostTrack(track, countdown);
    const rail = element("nav", undefined, "rail"); rail.setAttribute("aria-label", t.views);
    for (const name of ["climate", "temperature", "humidity", "program", "boost", "statistics", "info"]) {
      // Climate is the return action on the active chart's shortcut, matching
      // the original card without an extra permanent toolbar row.
      if (name === "climate") continue;
      const selected = this._view === name;
      const button = this._button(undefined, () => this._activate(selected ? "climate" : name));
      button.dataset.view = name; button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", selected ? `${t.climate}: ${t[name]}` : t[name]);
      button.append(icon(selected ? "climate" : name), element("span", selected ? t.climate : t[name]));
      if (name === "boost" && countdown) {
        button.append(element("span", String(Math.ceil(countdown.minutes)), "badge"));
      }
      rail.append(button);
    }
    const panelId = `view-${this._device.entry_id.replace(/[^a-z0-9]/gi, "")}`;
    view.id = panelId; view.setAttribute("role", "region"); view.setAttribute("aria-label", t[this._view]);
    for (const button of rail.children) button.setAttribute("aria-controls", panelId);
    if (this._view === "climate") this._dial(view, state, status);
    else if (this._view === "boost") this._boost(view, state, status);
    else if (this._view === "program") this._program(view, status);
    else if (this._view === "info") this._info(view, state, status);
    else this._chart(view);
    if (this._error) { const error = element("div", t[this._error], "error"); error.setAttribute("role", "alert"); view.append(error); }
    body.append(view, track, rail);
    const footer = element("div", undefined, "footer"), humidity = element("span", undefined, "metric");
    humidity.append(icon("humidity"), document.createTextNode(this._sensor("humidity")));
    const live = telemetry(state), notice = element("span", undefined, "live");
    notice.append(element("span", undefined, `dot${live.key === "fresh" ? " fresh" : ""}`), document.createTextNode(
      `${status === "readOnly" ? t.readOnly : live.key === "retained" ? t.notLive : t[live.key]}${live.minutes !== undefined ? ` · ${live.minutes} ${t.ago}` : ""}`));
    footer.append(humidity, notice); shell.append(head, body, footer);
    this.shadowRoot.replaceChildren(element("style", FACE_STYLE), shell);
  }
  _sensor(key) { return sameDevice(this._hass, this._ids.climate, this._ids[key]) ? displayState(this._hass, this._ids[key], words(this._hass).unknown) : words(this._hass).unknown; }
  _format(value, digits = 1) { return number(value) === null ? "—" : new Intl.NumberFormat(this._hass.language, { maximumFractionDigits: digits }).format(Number(value)); }
  _dial(view, state, status) {
    const t = words(this._hass), attr = state?.attributes || {}, unit = this._hass.config?.unit_system?.temperature || "°C";
    const dial = element("div", undefined, "dial"), svg = svgNode("svg", { viewBox: "0 0 260 230", "aria-hidden": "true" });
    const point = (angle, radius = 99) => [130 + radius * Math.cos(angle * Math.PI / 180), 124 + radius * Math.sin(angle * Math.PI / 180)];
    const arc = (angle) => { const a = point(140), b = point(angle); return `M${a[0]} ${a[1]} A99 99 0 ${angle - 140 > 180 ? 1 : 0} 1 ${b[0]} ${b[1]}`; };
    for (let i = 0; i <= 20; i++) { const a = point(140 + i * 13, 110), b = point(140 + i * 13, 114); svg.append(svgNode("path", { d: `M${a} L${b}`, stroke: "var(--divider-color,#e8eaed)", "stroke-width": 1 })); }
    svg.append(svgNode("path", { d: arc(400), fill: "none", stroke: "var(--divider-color,#eff0f2)", "stroke-width": 10, "stroke-linecap": "round" }));
    const target = number(this._draft ?? attr.temperature), min = number(attr.min_temp), max = number(attr.max_temp);
    if (usable(state) && target !== null && min !== null && max !== null && max > min) {
      const angle = 140 + 260 * Math.max(0.001, Math.min(1, (target - min) / (max - min)));
      const color = state.state === "off" ? "#a5adb5" : attr.hvac_action === "heating" ? "#ee943d" : "#d6b76e";
      svg.append(svgNode("path", { d: arc(angle), fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round" }));
      const marker = point(angle); svg.append(svgNode("circle", { cx: marker[0], cy: marker[1], r: 7, fill: "var(--card-background-color,#fff)", stroke: color, "stroke-width": 3 }));
    }
    const face = element("div", undefined, "dial-face"), temperature = element("div", this._format(usable(state) ? attr.current_temperature : null), "temperature");
    temperature.append(element("small", unit));
    const action = attr.hvac_action, activity = element("span", undefined, "activity");
    activity.append(icon("boost"), document.createTextNode(usable(state) ? t[action] || t.unknown : t.unavailable));
    face.append(element("span", t.current, "eyebrow"), temperature, activity); dial.append(svg, face); view.append(dial);
    const targetRow = element("div", undefined, "target");
    const adjust = (amount) => {
      const value = number(this._draft ?? this._hass.states[this._ids.climate]?.attributes.temperature);
      const attributes = this._hass.states[this._ids.climate]?.attributes || {};
      if (value === null || gate(this._hass, this._ids.climate) !== "ready") return;
      this._draft = Math.round(Math.max(attributes.min_temp, Math.min(attributes.max_temp, value + amount * (number(attributes.target_temp_step) || 0.1))) * 1000) / 1000;
      this._render(true);
    };
    const minus = this._button(undefined, () => adjust(-1), "round"), plus = this._button(undefined, () => adjust(1), "round");
    minus.append(icon("minus")); plus.append(icon("plus")); minus.setAttribute("aria-label", t.decrease); plus.setAttribute("aria-label", t.increase);
    minus.disabled = plus.disabled = status !== "ready" || this._busy || target === null;
    const center = element("div", undefined, "target-value"), input = element("input");
    input.type = "number"; input.min = attr.min_temp; input.max = attr.max_temp; input.step = attr.target_temp_step || 0.1; input.value = target ?? "";
    input.disabled = status !== "ready" || this._busy; input.setAttribute("aria-label", t.setpoint);
    input.addEventListener("input", () => { this._draft = input.value; });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") this._command("climate", "set_temperature", this._ids.climate, { temperature: number(input.value) }); });
    center.append(element("label", t.target), input, element("span", unit)); targetRow.append(minus, center, plus); view.append(targetRow);
    const apply = this._button(this._busy ? t.pending : t.apply, () => this._command("climate", "set_temperature", this._ids.climate,
      { temperature: number(this.shadowRoot.querySelector("input")?.value) }), "apply");
    apply.disabled = status !== "ready" || this._busy; view.append(apply);
    const modes = element("div", undefined, "modes");
    for (const mode of ["off", "heat", "auto"]) {
      const button = this._button(t[mode], () => this._command("climate", "set_hvac_mode", this._ids.climate, { hvac_mode: mode }));
      button.setAttribute("aria-pressed", String(state?.state === mode)); button.disabled = status !== "ready" || this._busy || !attr.hvac_modes?.includes(mode); modes.append(button);
    }
    view.append(modes);
  }
  _boost(view, state, status) {
    const t = words(this._hass); view.append(element("h3", "Boost"), element("p", t.boostHelp, "blocked"));
    const choices = element("div", undefined, "options");
    for (const minutes of [30, 60, 90]) { const button = this._button(`${minutes} min`, () => { this._boostMinutes = minutes; this._render(true); }); button.setAttribute("aria-pressed", String(minutes === this._boostMinutes)); choices.append(button); }
    const start = this._button(this._busy ? t.pending : t.startBoost, () => this._command("button", "press", this._ids[`boost_${this._boostMinutes}`]), "apply");
    start.disabled = status !== "ready" || this._busy || !controlAvailable(this._hass.states[this._ids[`boost_${this._boostMinutes}`]]);
    const cancel = this._button(t.cancelLabel, () => this._command("button", "press", this._ids.cancel_boost), "secondary");
    cancel.disabled = status !== "ready" || this._busy || state?.attributes.vendor_mode !== "BOOST" || !controlAvailable(this._hass.states[this._ids.cancel_boost]);
    view.append(choices, start, cancel, element("p", state?.attributes.vendor_mode === "BOOST" ? `${t.end}: ${this._sensor("boost_end")}` : t.noBoost, "blocked"));
  }
  _program(view, status) {
    const t = words(this._hass), state = this._hass.states[this._ids.program];
    view.append(element("h3", t.program), element("div", this._sensor("active_program"), "big"));
    if (!controlAvailable(state) || !sameDevice(this._hass, this._ids.climate, this._ids.program)) { view.append(element("p", t.unavailable, "blocked")); return; }
    const select = element("select"); select.setAttribute("aria-label", t.program);
    for (const value of state.attributes.options || []) select.append(new Option(value, value)); select.value = state.state;
    select.disabled = status !== "ready" || this._busy;
    const apply = this._button(this._busy ? t.pending : t.apply, () => this._command("select", "select_option", this._ids.program, { option: select.value }), "apply");
    apply.disabled = status !== "ready" || this._busy; view.append(select, apply);
  }
  _info(view, state, status) {
    const t = words(this._hass), details = element("dl"); view.append(element("h3", t.info));
    for (const [label, value] of [[t.mode, t[state?.state] || t.unavailable], [t.controls, status === "ready" ? t.fresh : t[status]],
      [t.lastLive, localDate(this._hass, state?.attributes.last_live_message)], [t.end, state?.attributes.vendor_mode === "BOOST" ? this._sensor("boost_end") : t.noBoost]]) details.append(element("dt", label), element("dd", value));
    view.append(details);
  }
  async _loadHistory(force = false) {
    const kind = this._view === "statistics" ? "statistics" : "chart";
    if (!this._hass || !this._ids || this._historyLoading.has(kind) || (!force && Date.now() - (this._history[kind]?.fetched || 0) < 60000)) return;
    this._historyLoading.add(kind);
    const end = Date.now(), start = end - (kind === "statistics" ? 7 : 1) * 86400000;
    try {
      const ids = [this._ids.climate, ...(kind === "chart" && this._ids.humidity ? [this._ids.humidity] : [])];
      const data = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(),
        entity_ids: ids, include_start_time_state: true, significant_changes_only: false, minimal_response: false, no_attributes: false });
      this._history[kind] = { data, start, end, fetched: Date.now() };
    } catch { this._history[kind] = { error: true, fetched: Date.now() }; }
    finally { this._historyLoading.delete(kind); this._historyVersion = (this._historyVersion || 0) + 1; this._render(); }
  }
  _chart(view) {
    const t = words(this._hass), stats = this._view === "statistics", cached = this._history[stats ? "statistics" : "chart"];
    const title = element("div", undefined, "view-title"); title.append(element("h3", stats ? t.heating : t[this._view]), element("span", stats ? t.week : t.day, "period")); view.append(title);
    if (!cached || cached.error) {
      view.append(element("div", !cached ? t.loadingHistory : t.noHistory, "empty"));
      if (cached?.error) view.append(this._button(t.retry, () => this._loadHistory(true), "secondary")); return;
    }
    if (stats) { this._statistics(view, cached); return; }
    const humidity = this._view === "humidity", id = humidity ? this._ids.humidity : this._ids.climate, unit = humidity ? "%" : this._hass.config?.unit_system?.temperature || "°C";
    const points = historyRows(cached.data?.[id]).map(row => ({ time: Math.max(cached.start, row.time), value: ["unknown", "unavailable"].includes(row.state) ? null : number(humidity ? row.state : row.attributes.current_temperature) }));
    const values = points.map(p => p.value).filter(v => v !== null);
    if (!values.length) { view.append(element("div", t.emptyHistory, "empty")); return; }
    const min = values.reduce((a, b) => Math.min(a, b), Infinity), max = values.reduce((a, b) => Math.max(a, b), -Infinity), span = Math.max(max - min, humidity ? 4 : 1), low = min - span * 0.2, high = max + span * 0.2;
    const chart = element("div", undefined, "chart"), svg = svgNode("svg", { viewBox: "0 0 300 170", role: "img", "aria-label": `${t[this._view]} · ${t.day}` });
    const color = humidity ? "#76acc8" : "#e9a04f", y = v => 135 - (v - low) / (high - low) * 110;
    for (let i = 0; i < 4; i++) { const yy = 20 + i * 38; svg.append(svgNode("line", { x1: 10, y1: yy, x2: 290, y2: yy, stroke: "var(--divider-color,#eef0f2)", "stroke-width": 1 })); }
    let segment = [];
    const flush = () => {
      if (segment.length > 1) {
        svg.append(svgNode("polygon", { points: `${segment[0].split(",")[0]},140 ${segment.join(" ")} ${segment[segment.length - 1].split(",")[0]},140`, fill: color, "fill-opacity": 0.12 }));
        svg.append(svgNode("polyline", { points: segment.join(" "), fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linejoin": "round" }));
      } else if (segment.length) { const [cx, cy] = segment[0].split(","); svg.append(svgNode("circle", { cx, cy, r: 3, fill: color })); }
      segment = [];
    };
    for (const point of points) { if (point.value === null) { flush(); continue; } segment.push(`${10 + (point.time - cached.start) / (cached.end - cached.start) * 280},${y(point.value)}`); } flush();
    const formatTime = time => new Intl.DateTimeFormat(this._hass.language, { hour: "2-digit", minute: "2-digit", timeZone: this._hass.config?.time_zone }).format(time);
    svg.append(svgNode("text", { x: 10, y: 160, fill: "var(--secondary-text-color,#9098a0)", "font-size": 9 }, formatTime(cached.start)), svgNode("text", { x: 290, y: 160, "text-anchor": "end", fill: "var(--secondary-text-color,#9098a0)", "font-size": 9 }, formatTime(cached.end)));
    chart.append(svg); view.append(chart);
    const summary = element("div", undefined, "summary");
    for (const [name, value] of [[t.minimum, min], [t.maximum, max]]) { const item = element("div", name); item.append(element("strong", `${this._format(value)} ${unit}`)); summary.append(item); } view.append(summary);
  }
  _statistics(view, cached) {
    const t = words(this._hass), days = recordedHeating(cached.data?.[this._ids.climate] || [], cached.end, this._hass.config?.time_zone || "UTC");
    if (!days.some(day => day.known)) { view.append(element("div", t.emptyHistory, "empty")); return; }
    const today = days[6], big = element("div", today.known ? String(Math.round(today.heating / 60000)) : "—", "big"); big.append(element("small", ` min · ${t.today}`)); view.append(big);
    const svg = svgNode("svg", { viewBox: "0 0 300 140", style: "width:100%;height:auto", role: "img", "aria-label": t.recorded });
    const max = Math.max(60 * 60000, ...days.map(d => d.heating));
    days.forEach((day, index) => {
      const x = 8 + index * 42, height = day.heating / max * 75;
      svg.append(svgNode("rect", { x, y: 100 - Math.max(2, height), width: 24, height: Math.max(2, height), rx: 4, fill: day.known ? "#9cb798" : "var(--divider-color,#e8ebed)" }));
      svg.append(svgNode("text", { x: x + 12, y: 92 - height, "text-anchor": "middle", "font-size": 9, fill: "var(--secondary-text-color,#889099)" }, day.known ? String(Math.round(day.heating / 60000)) : "—"));
      svg.append(svgNode("text", { x: x + 12, y: 122, "text-anchor": "middle", "font-size": 9, fill: "var(--secondary-text-color,#889099)" }, new Intl.DateTimeFormat(this._hass.language, { weekday: "short", timeZone: "UTC" }).format(new Date(day.day + "T12:00:00Z"))));
    }); view.append(svg, element("p", t.recorded, "blocked"));
  }
  async _command(domain, service, entityId, data = {}) {
    const climate = this._hass.states[this._ids.climate], attr = climate?.attributes || {}, target = this._hass.states[entityId];
    let valid = false;
    if (domain === "climate" && entityId === this._ids.climate) {
      if (service === "set_temperature") valid = data.temperature !== null && Number.isFinite(data.temperature) && data.temperature >= attr.min_temp && data.temperature <= attr.max_temp;
      if (service === "set_hvac_mode") valid = attr.hvac_modes?.includes(data.hvac_mode);
    } else if (domain === "select" && service === "select_option" && entityId === this._ids.program) valid = target?.attributes.options?.includes(data.option);
    else if (domain === "button" && service === "press") {
      valid = ["boost_30", "boost_60", "boost_90", "cancel_boost"].some(key => this._ids[key] === entityId);
      if (entityId === this._ids.cancel_boost) valid = attr.vendor_mode === "BOOST" && usable(this._hass.states[this._ids.active_program]) && sameDevice(this._hass, this._ids.climate, this._ids.active_program);
    }
    if (this._busy || gate(this._hass, this._ids.climate) !== "ready" || !entityId?.startsWith(`${domain}.`)
      || !valid || !controlAvailable(target) || !sameDevice(this._hass, this._ids.climate, entityId)) {
      this._error = "failed"; this._render(true); return;
    }
    this._busy = true; this._error = undefined; this._render(true);
    try { await this._hass.callService(domain, service, { ...data, entity_id: entityId }); this._draft = undefined; }
    catch { this._error = "failed"; }
    finally { this._busy = false; this._render(true); }
  }
}

const PANEL_STYLE = `
  :host { display:block; height:100%; overflow:auto; color:var(--primary-text-color); background:var(--primary-background-color,#fafafa); font-family:var(--ha-font-family,Roboto,sans-serif); }
  header { display:flex; align-items:center; gap:16px; padding:12px 16px; background:var(--card-background-color,#fff); border-bottom:1px solid var(--divider-color,#ddd); }
  h1 { margin:0; font-size:20px; font-weight:500; }
  header button { border:0; background:transparent; color:inherit; font-size:24px; width:44px; height:44px; cursor:pointer; }
  main { padding:16px; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr)); gap:16px; align-items:start; max-width:1380px; margin:auto; }
  section { min-width:0; max-width:660px; }
  .notice { grid-column:1/-1; padding:16px; }
  .retry { padding:12px; cursor:pointer; }
`;

class SmartherPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cards = [];
  }

  set hass(hass) {
    const languageChanged = this._hass?.language !== hass.language;
    const registryChanged = this._hass?.entities !== hass.entities;
    this._hass = hass;
    for (const card of this._cards) card.hass = hass;
    if (languageChanged && this._entries) this._render();
    if (this.isConnected && (registryChanged || !this._entries)) this._load();
  }

  connectedCallback() {
    // Poll presentation metadata only; no subscriptions or private HA stores.
    // Also refreshes hidden/renamed entities and per-device visibility changes.
    this._timer = window.setInterval(() => this._load(), 30000);
    this._load();
  }

  disconnectedCallback() {
    window.clearInterval(this._timer);
  }

  async _load() {
    if (!this._hass || !this.isConnected || this._loading) return;
    this._loading = true;
    if (!this._entries) this._render();
    try {
      const result = await this._hass.callWS({ type: INFO_COMMAND });
      if (!this.isConnected) return;
      this._error = false;
      this._entries = result.entries.filter((entry) => entityMap(entry.entities).climate);
    } catch {
      this._error = true;
    } finally {
      this._loading = false;
      if (this.isConnected) this._render();
    }
  }

  _render() {
    if (!this._hass || !this.isConnected) return;
    const signature = JSON.stringify([this._hass.language, this._entries, this._error]);
    if (signature === this._signature) return;
    this._signature = signature;
    const t = words(this._hass);
    const header = element("header");
    const menu = element("button", "☰");
    menu.type = "button";
    menu.setAttribute("aria-label", t.menu);
    menu.onclick = () => this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
    header.append(menu, element("h1", "Smarther"));
    const main = element("main");
    this._cards = [];
    this.shadowRoot.replaceChildren(element("style", PANEL_STYLE), header, main);
    if (this._error || !this._entries?.length) {
      const notice = element("div", this._error ? t.loadFailed : this._entries ? t.none : t.loading, "notice");
      notice.setAttribute("role", "status");
      if (this._error) {
        const retry = element("button", t.retry, "retry");
        retry.onclick = () => this._load();
        notice.append(retry);
      }
      main.append(notice);
      return;
    }
    for (const device of this._entries) {
      const ids = entityMap(device.entities);
      const section = element("section");
      section.setAttribute("aria-label", device.title);
      main.append(section);
      const widget = document.createElement("smarther-thermostat");
      widget.setConfig({ device: { ...device, entities: ids } });
      widget.hass = this._hass;
      section.append(widget);
      this._cards.push(widget);
    }
  }

}

if (!customElements.get("smarther-thermostat")) customElements.define("smarther-thermostat", SmartherThermostat);
if (!customElements.get("smarther-panel")) customElements.define("smarther-panel", SmartherPanel);
