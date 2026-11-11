/** Automatic Smarther sidebar panel. Local assets; no startup service calls. */
const SOURCE = "bticino_mqtt_legacy_bridge";
const INFO_COMMAND = "bticino_smarther_mqtt/panel_info";
const ENTITY_DOMAINS = {
  climate: "climate", program: "select", humidity: "sensor", heating: "sensor",
  active_program: "sensor", boost_end: "sensor", last_message: "sensor",
  boost_30: "button", boost_60: "button", boost_90: "button", cancel_boost: "button",
};
const ROWS = ["temperature", "mode", "program", "boost", "status", "telemetry", "boost_end"];
const TEXT = {
  en: {
    climate: "Climate", temperature: "Target", apply: "Apply", mode: "Mode",
    off: "Off", heat: "Heat", auto: "Auto", program: "Program", boost: "Boost",
    cancel: "Cancel", cancelLabel: "Cancel Boost and resume the schedule",
    humidity: "Humidity", heating: "Heating", idle: "Idle", unknown: "Unknown",
    unavailable: "Unavailable", readOnly: "Read-only", stale: "Stale telemetry",
    fresh: "Live telemetry", noLive: "Waiting for live telemetry", retained: "Retained snapshot only",
    end: "Boost ends", noBoost: "No active Boost", ago: "min ago", pending: "Sending…",
    failed: "Command refused or failed. Check telemetry and integration options.",
    invalid: "Check the selected value before applying.",
    loading: "Loading thermostats…", none: "No visible thermostats. Check availability, panel visibility and your entity permissions.",
    loadFailed: "Thermostats could not be loaded.", retry: "Retry", menu: "Open sidebar",
    current: "Current temperature", featureName: "Smarther controls and status",
  },
  it: {
    climate: "Clima", temperature: "Temperatura", apply: "Applica", mode: "Modalità",
    off: "Off", heat: "Manuale", auto: "Auto", program: "Programma", boost: "Boost",
    cancel: "Annulla", cancelLabel: "Annulla Boost e riprendi il programma",
    humidity: "Umidità", heating: "Riscaldamento", idle: "Inattivo", unknown: "Sconosciuto",
    unavailable: "Non disponibile", readOnly: "Sola lettura", stale: "Telemetria obsoleta",
    fresh: "Telemetria live", noLive: "In attesa di telemetria live", retained: "Solo dati retained",
    end: "Fine Boost", noBoost: "Nessun Boost attivo", ago: "min fa", pending: "Invio…",
    failed: "Comando rifiutato o non riuscito. Controlla telemetria e opzioni dell’integrazione.",
    invalid: "Controlla il valore selezionato prima di applicarlo.",
    loading: "Caricamento termostati…", none: "Nessun termostato visibile. Controlla disponibilità, visibilità pannello e permessi sulle entità.",
    loadFailed: "Impossibile caricare i termostati.", retry: "Riprova", menu: "Apri barra laterale",
    current: "Temperatura attuale", featureName: "Smarther: controlli e stato",
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

const FEATURE_STYLE = `
  :host { display:block; height:var(--feature-height,42px); color:var(--primary-text-color); font:inherit; }
  .row { display:flex; align-items:center; gap:8px; height:100%; min-width:0; }
  button, input, select { box-sizing:border-box; min-width:0; height:100%; border:0; border-radius:var(--feature-border-radius,12px); font:inherit; color:var(--primary-text-color); background:var(--secondary-background-color,#f1f3f5); pointer-events:auto; }
  button { flex:1; padding:0 8px; cursor:pointer; }
  button[aria-pressed=true] { color:var(--text-primary-color,#fff); background:var(--primary-color,#03a9f4); }
  button:disabled { opacity:.45; cursor:default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:-2px; }
  input, select { flex:1; width:100%; padding:0 8px; }
  label { display:flex; align-items:center; gap:6px; min-width:0; flex:3; height:100%; }
  label span { flex-shrink:0; font-size:13px; }
  .value { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
  .blocked { color:var(--secondary-text-color); }
  .error { color:var(--error-color,#db4437); white-space:normal; font-size:12px; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--warning-color,#ff9800); flex-shrink:0; }
  .fresh { background:var(--success-color,#43a047); }
  @media (max-width:360px) { .row { gap:4px; } button { padding:0 5px; font-size:13px; } }
`;

class SmartherFeature extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    for (const name of ["click", "change", "keydown", "pointerdown"]) {
      this.shadowRoot.addEventListener(name, (event) => event.stopPropagation());
    }
  }

  setConfig(config) {
    if (!config || !ROWS.includes(config.row || "status")) throw new Error("Unknown Smarther feature row");
    this._config = { row: "status", ...config, entities: entityMap(config.entities) };
    this._signature = undefined;
    this._render();
  }

  set hass(hass) { this._hass = hass; this._render(); }
  set context(context) { this._context = context; this._render(); }

  static getStubConfig(hass, context) {
    return { type: "custom:smarther-feature", row: "status", entities: { climate: context.entity_id } };
  }

  connectedCallback() {
    this._timer = window.setInterval(() => this._render(), 15000);
    this._render();
  }

  disconnectedCallback() {
    window.clearInterval(this._timer);
  }

  _render() {
    if (!this._config || !this._hass || !this._context || !this.isConnected) return;
    const hass = this._hass;
    const t = words(hass);
    const climateId = this._context.entity_id;
    const state = smartherState(hass, climateId);
    const ids = this._config.entities;
    const status = gate(hass, climateId);
    const live = telemetry(state);
    const signature = JSON.stringify([
      this._config.row, hass.language, status, live, this._busy, this._error,
      state, ...Object.values(ids).map((id) => hass.states?.[id]),
    ]);
    if (signature === this._signature) return;
    // Do not reset an in-progress selection on unrelated state updates.
    if (this.shadowRoot.activeElement && status === "ready" && !this._busy && !this._error) return;
    this._signature = signature;
    const root = this.shadowRoot;
    const row = element("div", undefined, "row");
    root.replaceChildren(element("style", FEATURE_STYLE), row);
    if (!state || (ids.climate && ids.climate !== climateId)) {
      row.append(element("span", t.unavailable, "value blocked"));
      return;
    }
    if (this._error) {
      const message = element("span", t[this._error], "value error");
      message.setAttribute("role", "alert");
      message.title = t[this._error];
      const dismiss = element("button", "×");
      dismiss.setAttribute("aria-label", t.cancel);
      dismiss.onclick = () => { this._error = undefined; this._signature = undefined; this._render(); };
      row.append(message, dismiss);
      return;
    }
    const kind = this._config.row;
    const sensor = (key) => sameDevice(hass, climateId, ids[key]) ? displayState(hass, ids[key], t.unknown) : t.unknown;
    const label = (value, className = "value") => { const node = element("span", value, className); node.title = value; row.append(node); };

    if (kind === "status") {
      label(`${t.humidity}: ${sensor("humidity")}`);
      const action = state.attributes.hvac_action;
      label(action === "heating" ? t.heating : action === "idle" ? t.idle : action === "off" ? t.off : t.unknown);
    } else if (kind === "telemetry") {
      row.append(element("span", undefined, `dot ${live.key === "fresh" ? "fresh" : ""}`));
      label(`${t[live.key]}${live.minutes !== undefined ? ` · ${live.minutes} ${t.ago}` : ""}`);
      row.title = localDate(hass, state.attributes.last_live_message);
    } else if (kind === "boost_end") {
      label(state.attributes.vendor_mode === "BOOST" ? `${t.end}: ${sensor("boost_end")}` : t.noBoost);
    } else if (status !== "ready") {
      const current = kind === "temperature" ? state.attributes.temperature ?? t.unknown
        : kind === "program" ? sensor("active_program") : kind === "mode" ? t[state.state] || t.unknown : "";
      label(`${t[kind]}${current !== "" ? `: ${current}` : ""} · ${t[status]}`, "value blocked");
    } else if (this._busy) {
      label(t.pending, "value blocked");
    } else if (kind === "temperature") {
      const input = element("input");
      input.type = "number";
      input.min = state.attributes.min_temp;
      input.max = state.attributes.max_temp;
      input.step = state.attributes.target_temp_step || 0.1;
      input.value = state.attributes.temperature ?? "";
      input.setAttribute("aria-label", t.temperature);
      const control = element("label");
      control.append(element("span", t.temperature), input);
      row.append(control);
      this._button(row, t.apply, () => {
        const value = Number(input.value);
        const attr = this._hass.states[climateId]?.attributes || {};
        if (!input.value || !input.checkValidity() || !Number.isFinite(value)
          || value < attr.min_temp || value > attr.max_temp) return this._invalid();
        return this._command("climate", "set_temperature", climateId, { temperature: value });
      });
    } else if (kind === "mode") {
      for (const mode of ["off", "heat", "auto"]) {
        const button = this._button(row, t[mode], () => {
          if (!this._hass.states[climateId]?.attributes.hvac_modes?.includes(mode)) return this._invalid();
          return this._command("climate", "set_hvac_mode", climateId, { hvac_mode: mode });
        });
        button.disabled = !state.attributes.hvac_modes?.includes(mode);
        button.setAttribute("aria-pressed", String(state.state === mode));
      }
    } else if (kind === "program") {
      const program = hass.states[ids.program];
      if (!controlAvailable(program) || !sameDevice(hass, climateId, ids.program)) { label(`${t.program}: ${sensor("active_program")}`, "value blocked"); return; }
      const select = element("select");
      select.setAttribute("aria-label", t.program);
      for (const option of program.attributes.options || []) select.append(new Option(option, option));
      select.value = program.state;
      row.append(select);
      this._button(row, t.apply, () => {
        if (!this._hass.states[ids.program]?.attributes.options?.includes(select.value)) return this._invalid();
        return this._command("select", "select_option", ids.program, { option: select.value });
      });
    } else if (kind === "boost") {
      for (const minutes of [30, 60, 90, 0]) {
        const id = ids[minutes ? `boost_${minutes}` : "cancel_boost"];
        const button = this._button(row, minutes ? `${minutes}′` : t.cancel, () => {
          if (!minutes && (this._hass.states[climateId]?.attributes.vendor_mode !== "BOOST"
            || !usable(this._hass.states[ids.active_program])
            || !sameDevice(this._hass, climateId, ids.active_program))) return this._invalid();
          return this._command("button", "press", id);
        });
        button.setAttribute("aria-label", minutes ? `Boost ${minutes} min` : t.cancelLabel);
        button.disabled = !controlAvailable(hass.states[id]) || !sameDevice(hass, climateId, id)
          || (!minutes && (state.attributes.vendor_mode !== "BOOST"
            || !usable(hass.states[ids.active_program]) || !sameDevice(hass, climateId, ids.active_program)));
      }
    }
  }

  _button(row, text, onClick) {
    const button = element("button", text);
    button.type = "button";
    button.addEventListener("click", (event) => { event.stopPropagation(); onClick(); });
    row.append(button);
    return button;
  }

  _invalid() {
    this._error = "invalid";
    this._render();
  }

  async _command(domain, service, entityId, data = {}) {
    // Recheck at the gesture boundary, including when a control was focused as telemetry expired.
    const climateId = this._context.entity_id;
    if (this._busy || gate(this._hass, climateId) !== "ready"
      || !entityId?.startsWith(`${domain}.`) || !controlAvailable(this._hass.states[entityId])
      || !sameDevice(this._hass, climateId, entityId)) {
      this._error = "failed";
      this._render();
      return;
    }
    this._busy = true;
    this._error = undefined;
    this._render();
    try {
      // This does not assert a physical outcome. Displayed state always comes from HA telemetry.
      await this._hass.callService(domain, service, { ...data, entity_id: entityId });
    } catch {
      this._error = "failed";
    } finally {
      this._busy = false;
      this._render();
    }
  }
}

const PANEL_STYLE = `
  :host { display:block; height:100%; overflow:auto; color:var(--primary-text-color); background:var(--primary-background-color,#fafafa); font-family:var(--ha-font-family,Roboto,sans-serif); }
  header { display:flex; align-items:center; gap:16px; padding:12px 16px; background:var(--card-background-color,#fff); border-bottom:1px solid var(--divider-color,#ddd); }
  h1 { margin:0; font-size:20px; font-weight:500; }
  header button { border:0; background:transparent; color:inherit; font-size:24px; width:44px; height:44px; cursor:pointer; }
  main { padding:16px; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr)); gap:16px; align-items:start; max-width:1200px; margin:auto; }
  section { min-width:0; max-width:560px; }
  .widget { box-sizing:border-box; border:1px solid var(--divider-color,#ddd); border-radius:var(--ha-card-border-radius,12px); background:var(--card-background-color,#fff); padding:16px; }
  h2 { margin:0 0 8px; font-size:18px; overflow-wrap:anywhere; }
  .reading { margin:0 0 16px; color:var(--secondary-text-color); }
  smarther-feature { --feature-height:42px; margin-top:8px; }
  .notice { grid-column:1/-1; padding:16px; }
  .retry { padding:12px; cursor:pointer; }
`;

class SmartherPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cards = [];
    this._fallbacks = [];
  }

  set hass(hass) {
    const languageChanged = this._hass?.language !== hass.language;
    const registryChanged = this._hass?.entities !== hass.entities;
    this._hass = hass;
    for (const card of this._cards) card.hass = hass;
    this._updateReadings();
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
      // The public card helpers are available only after HA's dashboard runtime
      // has loaded. Never load private HA modules or require visiting a dashboard.
      if (this._helpers === undefined) {
        this._helpers = null;
        if (typeof window.loadCardHelpers === "function") {
          try { this._helpers = await window.loadCardHelpers(); } catch { /* Standalone widget below. */ }
        }
      }
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
    this._fallbacks = [];
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
      if (this._helpers) {
        try {
          const card = this._helpers.createCardElement({
            type: "tile", entity: ids.climate, name: device.title,
            state_content: ["current_temperature", "temperature"],
            tap_action: { action: "none" }, icon_tap_action: { action: "none" },
            features_position: "bottom",
            features: ROWS.map((row) => ({ type: "custom:smarther-feature", row, entities: ids })),
          });
          card.hass = this._hass;
          section.append(card);
          this._cards.push(card);
          continue;
        } catch { /* Standalone rendering remains available on every entry route. */ }
      }
      section.className = "widget";
      const reading = element("p", "", "reading");
      section.append(element("h2", device.title), reading);
      this._fallbacks.push({ id: ids.climate, reading });
      for (const row of ROWS) {
        const feature = document.createElement("smarther-feature");
        feature.setConfig({ row, entities: ids });
        feature.context = { entity_id: ids.climate };
        feature.hass = this._hass;
        section.append(feature);
        this._cards.push(feature);
      }
    }
    this._updateReadings();
  }

  _updateReadings() {
    if (!this._hass) return;
    const t = words(this._hass);
    for (const { id, reading } of this._fallbacks) {
      const state = this._hass.states[id];
      const value = state?.attributes.current_temperature;
      const unit = this._hass.config?.unit_system?.temperature || "°C";
      reading.textContent = `${t.current}: ${usable(state) && Number.isFinite(value)
        ? new Intl.NumberFormat(this._hass.language).format(value) + " " + unit : t.unavailable}`;
    }
  }
}

if (!customElements.get("smarther-feature")) customElements.define("smarther-feature", SmartherFeature);
if (!customElements.get("smarther-panel")) customElements.define("smarther-panel", SmartherPanel);

