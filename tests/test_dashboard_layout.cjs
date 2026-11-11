// Focused DOM-boundary regression, not a native Home Assistant render test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, handler) { this.listeners[name] = handler; }
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  dispatchEvent(event) { this.lastEvent = event; }
}
const registry = new Map();
const context = {
  HTMLElement: Element,
  document: { createElement: (tag) => new Element(tag), createTextNode: (text) => text },
  customElements: { get: (name) => registry.get(name), define: (name, value) => registry.set(name, value) },
  navigator: { language: 'en' }, window: {},
  Option: class { constructor(text, value) { this.text = text; this.value = value; } },
  CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,
  '../custom_components/bticino_smarther_mqtt/frontend/smarther-dashboard.js'), 'utf8'), context);
const Editor = registry.get('smarther-dashboard-editor');
const editor = new Editor();
const device = { entry_id: 'syntheticalpha', title: 'Synthetic alpha', enabled: true,
  entities: { climate: 'climate.synthetic_alpha', program: 'select.synthetic_alpha_program' } };
editor._entries = [device];
editor._hass = { language: 'en', panels: { 'smarther-syntheticalpha': {} } };
editor.setConfig({ type: 'custom:smarther', device });
function checkbox(node) {
  if (node?.type === 'checkbox') return node;
  for (const child of node?.children || []) { const found = checkbox(child); if (found) return found; }
}
for (const checked of [true, false]) {
  const input = checkbox(editor.shadowRoot);
  input.checked = checked;
  input.listeners.change({ stopPropagation() {} });
  assert.equal(editor.lastEvent.type, 'config-changed');
  assert.equal(editor.lastEvent.detail.config.native_only, checked);
  assert.equal(editor.lastEvent.detail.config.device, device,
    'Changing layout on the existing dashboard must preserve its device snapshot');
  assert.equal(editor._selectedId, device.entry_id);
}
// The fix must not bypass the occupied-URL check during a new selection.
editor._publishSelection();
assert.equal(editor.lastEvent.detail.config.device, undefined);
console.log('PASS: occupied-dashboard layout toggle preserves snapshot; new-selection guard retained');
