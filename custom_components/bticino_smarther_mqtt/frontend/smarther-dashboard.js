/**
 * Optional Smarther dashboard strategy and native-card features for HA 2026.11+.
 * No imports from private HA components, storage writes, MQTT, or startup actions.
 * Only explicit control handlers below call existing Home Assistant services.
 */

const SOURCE = "bticino_mqtt_legacy_bridge";
const INFO_COMMAND = "bticino_smarther_mqtt/dashboard_info";
const GUIDE = "https://github.com/alescim17/smarther/blob/main/docs/DASHBOARD.md";
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
    select: "Choose one thermostat", native: "Use built-in cards only (read-only)",
    nativeHelp: "The integrated controls need the Smarther resource. Built-in cards keep a read-only overview; take control to save a layout that no longer needs this resource.",
    loading: "Reading the entity registry…", loadFailed: "Dashboard tools are unavailable. Check integration Options, sign in as an administrator, or use the manual guide.",
    none: "No visible climate entity is available for an enabled entry. Enable dashboard tools in Smarther Options and check the entity settings.",
    prepared: "Ready. Continue in Home Assistant to choose the dashboard name, URL and sidebar visibility.",
    url: "Recommended dashboard URL", urlHelp: "Use this URL in the next Home Assistant step. Creating a different URL intentionally creates another dashboard.",
    existing: "A dashboard already uses this URL. Open it instead of creating a duplicate.",
    open: "Open existing dashboard", docs: "Dashboard guide", nativeConfig: "Manual fallback: built-in layout",
    copyHelp: "Copy this configuration into a new, empty dashboard's raw editor. JSON is valid YAML. It contains your actual entity IDs and no custom features.",
    ownership: "Creation is presentation only. Editing the generated dashboard requires Take control. Existing dashboards are never updated by Smarther.",
    chooseFirst: "Choose a thermostat in the Smarther dashboard settings before continuing.",
    missing: "This thermostat or some of its entities are unavailable. Check the integration; after renaming entities, update the dashboard references.",
    history: "Temperature history", nativeNotice: "Read-only layout. Standard controls can be added deliberately after taking control of this dashboard. The integration's command policy still applies.",
    featureName: "Smarther controls and status", strategyDescription: "A native climate tile with Smarther program, Boost and telemetry features.",
  },
  it: {
    climate: "Clima", temperature: "Temperatura", apply: "Applica", mode: "Modalità",
    off: "Off", heat: "Manuale", auto: "Auto", program: "Programma", boost: "Boost",
    cancel: "Annulla", cancelLabel: "Annulla Boost e riprendi il programma",
    humidity: "Umidità", heating: "Riscaldamento", idle: "Inattivo", unknown: "Sconosciuto",
    unavailable: "Non disponibile", readOnly: "Sola lettura", stale: "Telemetria obsoleta",
    fresh: "Telemetria live", noLive: "In attesa di telemetria live", retained: "Solo dati retained",
    end: "Fine Boost", noBoost: "Nessun Boost attivo", ago: "min fa", pending: "Invio…",
    failed: "Comando rifiutato o non riuscito. Controlla telemetria e opzioni dell'integrazione.",
    invalid: "Controlla il valore selezionato prima di applicarlo.",
    select: "Scegli un termostato", native: "Usa solo card native (sola lettura)",
    nativeHelp: "I controlli integrati richiedono la risorsa Smarther. Le sole card native offrono una vista in lettura; scegli Prendi il controllo per salvare un layout indipendente dalla risorsa.",
    loading: "Lettura del registro entità…", loadFailed: "Strumenti dashboard non disponibili. Controlla le Opzioni, accedi come amministratore oppure usa la guida manuale.",
    none: "Nessuna entità climate visibile per un dispositivo abilitato. Abilita gli strumenti dashboard nelle Opzioni Smarther e controlla le impostazioni delle entità.",
    prepared: "Pronto. Prosegui in Home Assistant per scegliere nome, URL e visibilità nella barra laterale.",
    url: "URL dashboard consigliato", urlHelp: "Usa questo URL nel passaggio successivo di Home Assistant. Un URL diverso crea intenzionalmente un'altra dashboard.",
    existing: "Una dashboard usa già questo URL. Aprila per evitare di creare un duplicato.",
    open: "Apri la dashboard esistente", docs: "Guida dashboard", nativeConfig: "Alternativa manuale: layout nativo",
    copyHelp: "Copia questa configurazione nell'editor della configurazione grezza di una dashboard nuova e vuota. JSON è YAML valido. Contiene gli ID reali e nessuna feature personalizzata.",
    ownership: "La creazione riguarda solo la visualizzazione. Per modificare il layout generato scegli Prendi il controllo. Smarther non aggiorna le dashboard esistenti.",
    chooseFirst: "Scegli un termostato nelle impostazioni della dashboard Smarther prima di proseguire.",
    missing: "Il termostato o alcune entità non sono disponibili. Controlla l'integrazione; dopo una rinomina aggiorna i riferimenti della dashboard.",
    history: "Storico temperature", nativeNotice: "Layout in sola lettura. Puoi aggiungere esplicitamente i controlli standard dopo aver preso il controllo della dashboard. Rimane valida la policy comandi dell'integrazione.",
    featureName: "Smarther: controlli e stato", strategyDescription: "Tile clima nativa con programma, Boost e telemetria Smarther.",
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

function nativeLayout(device, hass) {
  const t = words(hass);
  const ids = entityMap(device.entities);
  const climate = ids.climate;
  const sensors = ["humidity", "heating", "active_program", "boost_end", "last_message"]
    .filter((key) => ids[key]).map((key) => ids[key]);
  const card = {
    type: "tile", entity: climate, name: device.title,
    state_content: ["state", "current_temperature", "temperature"],
    tap_action: { action: "none" }, icon_tap_action: { action: "none" },
  };
  // Entity IDs are validated above before interpolation into native Jinja.
  const freshness = `{% set live = as_timestamp(state_attr('${climate}', 'last_live_message'), 0) %}\n`
    + `{% set limit = state_attr('${climate}', 'control_max_age_seconds') | int(0) %}\n`
    + `{% set age = as_timestamp(now()) - live %}\n`
    + `{% if states('${climate}') in ['unknown', 'unavailable'] %}${t.unavailable}`
    + `{% elif not live and state_attr('${climate}', 'last_message_retained') %}${t.retained}`
    + `{% elif not live %}${t.noLive}{% elif limit > 0 and -60 <= age <= limit %}${t.fresh}{% else %}${t.stale}{% endif %}`;
  return {
    title: device.title || "Smarther",
    views: [{ title: t.climate, path: "climate", cards: [
      card,
      ...(sensors.length ? [{ type: "entities", show_header_toggle: false, entities: sensors }] : []),
      { type: "markdown", content: `${freshness}\n\n${t.nativeNotice}` },
      { type: "history-graph", title: t.history, hours_to_show: 24, entities: [climate] },
    ] }],
  };
}

class SmartherDashboardStrategy extends HTMLElement {
  static configRequired = true;
  // This is a snapshot. Registry/state updates never add devices or overwrite a user's layout.
  static registryDependencies = [];

  static getConfigElement() {
    return document.createElement("smarther-dashboard-editor");
  }

  static getCreateSuggestions() {
    return { title: "Smarther", icon: "mdi:thermostat" };
  }

  static async generate(config, hass) {
    const t = words(hass);
    const device = config.device;
    const ids = entityMap(device?.entities);
    if (!device || !ids.climate) {
      return { views: [{ cards: [{ type: "markdown", content: `${t.chooseFirst}\n\n[${t.docs}](${GUIDE})` }] }] };
    }
    if (config.native_only) return nativeLayout({ ...device, entities: ids }, hass);
    return {
      title: device.title || "Smarther",
      views: [{ title: t.climate, path: "climate", cards: [
        {
          type: "tile", entity: ids.climate, name: device.title,
          state_content: ["current_temperature", "temperature"],
          tap_action: { action: "none" }, icon_tap_action: { action: "none" },
          features_position: "bottom",
          features: ROWS.map((row) => ({ type: "custom:smarther-feature", row, entities: ids })),
        },
        { type: "history-graph", title: t.history, hours_to_show: 24, entities: [ids.climate] },
      ] }],
    };
  }
}

const EDITOR_STYLE = `
  :host { display:block; color:var(--primary-text-color); font:inherit; }
  label, p, details { display:block; margin:12px 0; line-height:1.5; }
  select, input[type=text], textarea { box-sizing:border-box; width:100%; padding:10px; color:inherit; background:var(--card-background-color,#fff); border:1px solid var(--divider-color,#aaa); border-radius:8px; font:inherit; }
  button { min-height:42px; padding:8px 16px; color:var(--text-primary-color,#fff); background:var(--primary-color,#03a9f4); border:0; border-radius:10px; font:inherit; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  a { color:var(--primary-color,#03a9f4); }
  .notice { padding:12px; border:1px solid var(--divider-color,#aaa); border-radius:8px; }
  textarea { min-height:200px; font-family:monospace; font-size:12px; }
`;

class SmartherDashboardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { type: "custom:smarther" };
  }

  setConfig(config) {
    this._config = config || { type: "custom:smarther" };
    this._selectedId = this._config.device?.entry_id;
    this._render();
  }

  set hass(hass) {
    const panelsChanged = this._hass?.panels !== hass.panels;
    this._hass = hass;
    if (!this._loading && !this._entries && !this._error) this._load();
    else if (panelsChanged) this._render();
  }

  async _load() {
    this._loading = true;
    this._render();
    try {
      const result = await this._hass.callWS({ type: INFO_COMMAND });
      this._entries = result.entries.filter((entry) => entry.enabled && entityMap(entry.entities).climate);
    } catch {
      this._error = true;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _render() {
    if (!this._hass) return;
    const t = words(this._hass);
    const root = this.shadowRoot;
    root.replaceChildren(element("style", EDITOR_STYLE));
    const guide = element("a", t.docs);
    guide.href = GUIDE;
    guide.target = "_blank";
    guide.rel = "noopener noreferrer";
    root.append(guide);
    if (this._loading || this._error || !this._entries?.length) {
      root.append(element("p", t[this._loading ? "loading" : this._error ? "loadFailed" : "none"]));
      return;
    }
    const select = element("select");
    select.setAttribute("aria-label", t.select);
    select.append(new Option(t.select, ""));
    for (const entry of this._entries) select.append(new Option(`${entry.title} — ${entry.entities.climate}`, entry.entry_id));
    select.value = this._selectedId || "";
    select.addEventListener("change", (event) => {
      event.stopPropagation();
      this._selectedId = select.value;
      this._publishSelection();
      this._render();
    });
    const label = element("label", t.select);
    label.append(select);
    root.append(label);
    const entry = this._entries.find((item) => item.entry_id === this._selectedId);
    if (!entry) return;

    const recommended = `smarther-${entry.entry_id.toLowerCase()}`;
    const urlLabel = element("label", t.url);
    const urlInput = element("input");
    urlInput.type = "text";
    urlInput.readOnly = true;
    urlInput.value = recommended;
    urlInput.addEventListener("focus", () => urlInput.select());
    urlLabel.append(urlInput);
    root.append(urlLabel, element("p", t.urlHelp));
    const exists = Boolean(this._hass.panels?.[recommended]);
    if (exists) {
      const notice = element("p", t.existing + " ", "notice");
      const link = element("a", t.open);
      link.href = `/${recommended}`;
      notice.append(link);
      root.append(notice);
    }
    const native = element("input");
    native.type = "checkbox";
    native.checked = Boolean(this._config.native_only);
    native.addEventListener("change", (event) => {
      event.stopPropagation();
      this._config = { ...this._config, native_only: native.checked };
      // A layout change keeps the existing snapshot, including when editing
      // the dashboard at its already-occupied recommended URL.
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: this._config }, bubbles: true, composed: true,
      }));
      this._render();
    });
    const nativeLabel = element("label");
    nativeLabel.append(native, document.createTextNode(` ${t.native}`));
    root.append(nativeLabel, element("p", t.nativeHelp));
    if (!exists) root.append(element("p", t.prepared, "notice"));
    root.append(element("p", t.ownership));

    const details = element("details");
    details.append(element("summary", t.nativeConfig), element("p", t.copyHelp));
    const textarea = element("textarea");
    textarea.readOnly = true;
    textarea.setAttribute("aria-label", t.nativeConfig);
    textarea.value = JSON.stringify(nativeLayout(entry, this._hass), null, 2);
    textarea.addEventListener("focus", () => textarea.select());
    details.append(textarea);
    root.append(details);
  }

  _publishSelection() {
    const entry = this._entries.find((item) => item.entry_id === this._selectedId);
    const occupied = entry && this._hass.panels?.[`smarther-${entry.entry_id.toLowerCase()}`];
    // Changing the selection must never leave a previously selected device in
    // HA's creation dialog. An unconfigured strategy renders guidance only.
    this._config = {
      type: "custom:smarther", native_only: Boolean(this._config.native_only),
      ...(entry && !occupied ? {
        device: { entry_id: entry.entry_id, title: entry.title, entities: entityMap(entry.entities) },
      } : {}),
    };
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this._config }, bubbles: true, composed: true,
    }));
  }
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

if (!customElements.get("smarther-dashboard-editor")) customElements.define("smarther-dashboard-editor", SmartherDashboardEditor);
if (!customElements.get("ll-strategy-dashboard-smarther")) customElements.define("ll-strategy-dashboard-smarther", SmartherDashboardStrategy);
if (!customElements.get("smarther-feature")) customElements.define("smarther-feature", SmartherFeature);

window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((strategy) => strategy.type === "smarther" && strategy.strategyType === "dashboard")) {
  window.customStrategies.push({
    type: "smarther", strategyType: "dashboard", name: "Smarther",
    description: words().strategyDescription, documentationURL: GUIDE,
  });
}
window.customCardFeatures = window.customCardFeatures || [];
if (!window.customCardFeatures.some((feature) => feature.type === "smarther-feature")) {
  window.customCardFeatures.push({
    type: "smarther-feature", name: words().featureName, configurable: true,
    isSupported: (hass, context) => Boolean(smartherState(hass, context.entity_id)),
  });
}
