// DOM-boundary tests. Authentic HA/Tile rendering is checked separately in the isolated pilot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.isConnected = true; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  dispatchEvent(event) { this.lastEvent = event; }
  checkValidity() { return true; }
}
function runtime(helpers) {
  const registry = new Map();
  const timers = new Map();
  const context = {
    HTMLElement: Element,
    document: { createElement: (tag) => registry.has(tag) ? new (registry.get(tag))() : new Element(tag) },
    customElements: { get: (name) => registry.get(name), define: (name, value) => registry.set(name, value) },
    navigator: { language: 'en' },
    window: { setInterval: (fn, delay) => { timers.set(fn, delay); return fn; }, clearInterval: (id) => timers.delete(id),
      ...(helpers ? { loadCardHelpers: async () => helpers } : {}) },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../custom_components/bticino_smarther_mqtt/frontend/smarther-panel.js'), 'utf8'), context);
  return { registry, timers };
}
async function main() {
  const ids = { climate: 'climate.renamed', program: 'select.renamed', boost_30: 'button.boost', active_program: 'sensor.active' };
  const device = { entry_id: 'synthetic', title: 'Synthetic', entities: ids };
  const states = {
    [ids.climate]: { state: 'heat', attributes: { source: 'bticino_mqtt_legacy_bridge', controls_enabled: true,
      last_live_message: new Date().toISOString(), control_max_age_seconds: 1200, current_temperature: 20.5, temperature: 21,
      min_temp: 5, max_temp: 30, hvac_modes: ['heat','off','auto'] } },
    [ids.program]: { state: '1', attributes: { options: ['1','2'] } },
    [ids.boost_30]: { state: 'unknown', attributes: {} },
    [ids.active_program]: { state: '1', attributes: {} },
  };
  const calls = [];
  const hass = { language: 'en', states, entities: Object.fromEntries(Object.values(ids).map(id => [id,{device_id:'synthetic'}])),
    config: { unit_system: { temperature: '°C' } },
    callWS: async (msg) => { assert.equal(msg.type, 'bticino_smarther_mqtt/panel_info'); return { entries: [device] }; },
    callService: async (...args) => calls.push(args),
  };
  const cold = runtime();
  const Panel = cold.registry.get('smarther-panel');
  const panel = new Panel();
  panel._hass = hass;
  await panel._load();
  assert.equal(panel._cards.length, 7, 'Direct panel entry renders all rows without card helpers');
  assert.equal(panel._fallbacks.length, 1);
  assert.match(panel._fallbacks[0].reading.textContent, /20.5/);
  assert.equal(calls.length, 0, 'Rendering must not send services');
  const oldCards = panel._cards;
  await panel._load();
  assert.equal(panel._cards, oldCards, 'Metadata refresh must preserve focused controls');
  const feature = panel._cards[0];
  await feature._command('climate','set_temperature',ids.climate,{temperature:22});
  assert.equal(calls.length, 1);
  assert.equal(states[ids.climate].attributes.temperature,21,'No optimistic state update');
  states[ids.climate].attributes.controls_enabled = false;
  await feature._command('button','press',ids.boost_30);
  states[ids.climate].attributes.controls_enabled = true;
  states[ids.climate].attributes.last_live_message = '2000-01-01T00:00:00Z';
  await feature._command('button','press',ids.boost_30);
  states[ids.climate].state = 'unavailable';
  await feature._command('button','press',ids.boost_30);
  assert.equal(calls.length, 1, 'Read-only, stale and unavailable gestures must be blocked');
  panel.connectedCallback();
  assert.ok([...cold.timers.values()].includes(30000));
  panel.disconnectedCallback();
  assert.equal(cold.timers.size,0);
  const nativeConfigs = [];
  const warm = runtime({ createCardElement: config => { nativeConfigs.push(config); return new Element('native-tile'); } });
  const nativePanel = new (warm.registry.get('smarther-panel'))();
  nativePanel._hass = hass;
  await nativePanel._load();
  assert.equal(nativeConfigs[0].type,'tile');
  assert.equal(nativeConfigs[0].features.length,7);
  assert.equal(nativeConfigs[0].tap_action.action,'none');
  assert.equal(nativePanel._cards[0].hass,hass);
  assert.equal(nativePanel._fallbacks.length,0);
  assert.equal(calls.length,1,'Native Tile creation must not call services');
  console.log('PASS cold-start panel, native Tile helper path, refresh/timer cleanup and command gates');
}
main();
