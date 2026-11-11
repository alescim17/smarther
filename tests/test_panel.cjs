// DOM-boundary safety and history tests; browser layout is verified separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) { this.tag = tag; this.tagName=String(tag).toUpperCase(); this.children = []; this.listeners = {}; this.isConnected = true; this.dataset={}; this.classList={add(){}}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this[key] = value; }
  removeAttribute(key) { delete this[key]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  dispatchEvent(event) { this.lastEvent = event; }
  checkValidity() { return true; }
  querySelector(tag) { return find(this,n=>tag.startsWith('.') ? n.className===tag.slice(1) : n.tag===tag); }
}
function runtime(helpers) {
  const registry = new Map();
  const timers = new Map();
  const context = {
    HTMLElement: Element,
    document: { createElement: (tag) => registry.has(tag) ? new (registry.get(tag))() : new Element(tag), createElementNS: (_,tag)=>new Element(tag), createTextNode: text=>({textContent:text}) },
    customElements: { get: (name) => registry.get(name), define: (name, value) => registry.set(name, value) },
    navigator: { language: 'en' },
    window: { setInterval: (fn, delay) => { timers.set(fn, delay); return fn; }, clearInterval: (id) => timers.delete(id),
      ...(helpers ? { loadCardHelpers: async () => helpers } : {}) },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,
    '../custom_components/bticino_smarther_mqtt/frontend/smarther-panel.js'), 'utf8'), context);
  return { registry, timers, context };
}
async function main() {
  const ids = { climate: 'climate.renamed', program: 'select.renamed', humidity: 'sensor.humidity', boost_end: 'sensor.boost_end', boost_30: 'button.boost', boost_60: 'button.boost_60', cancel_boost: 'button.cancel', active_program: 'sensor.active' };
  const device = { entry_id: 'synthetic', title: 'Synthetic', entities: ids };
  const now = Date.now();
  const states = {
    [ids.climate]: { state: 'heat', attributes: { source: 'bticino_mqtt_legacy_bridge', controls_enabled: true,
      last_live_message: new Date(now).toISOString(), control_max_age_seconds: 1200, current_temperature: 20.5, temperature: 21,
      min_temp: 5, max_temp: 30, hvac_action: 'heating', hvac_modes: ['heat','off','auto'] } },
    [ids.program]: { state: '1', attributes: { options: ['1','2'] } },
    [ids.humidity]: { state: '45', attributes: { unit_of_measurement: '%' } },
    [ids.boost_30]: { state: 'unknown', attributes: {} },
    [ids.boost_60]: { state: 'unknown', attributes: {} },
    [ids.cancel_boost]: { state: 'unknown', attributes: {} },
    [ids.active_program]: { state: '1', attributes: {} },
  };
  const calls = [], queries = [];
  const hass = { language: 'en', states, entities: Object.fromEntries(Object.values(ids).map(id => [id,{device_id:'synthetic'}])),
    config: { unit_system: { temperature: '°C' }, time_zone: 'Europe/Rome' },
    callWS: async (msg) => {
      queries.push(msg);
      if (msg.type === 'bticino_smarther_mqtt/panel_info') return { entries: [device] };
      assert.equal(msg.type, 'history/history_during_period');
      assert.ok(msg.entity_ids.every(id=>Object.values(ids).includes(id)));
      return { [ids.climate]: [
        {lu:(now-3600000)/1000,s:'heat',a:{current_temperature:20}},
        {lu:(now-3000000)/1000,s:'heat',a:{current_temperature:21}},
        {lu:(now-2000000)/1000,s:'unavailable',a:{}},
        {lu:(now-1000000)/1000,s:'heat',a:{current_temperature:22}}],
        [ids.humidity]: [{lu:now/1000,s:'unknown',a:{}}] };
    },
    callService: async (...args) => calls.push(args),
  };
  const {registry,timers,context}=runtime();
  assert.equal(vm.runInContext('JSON.stringify(Object.keys(TEXT.en).sort())',context),vm.runInContext('JSON.stringify(Object.keys(TEXT.it).sort())',context));
  const panel = new (registry.get('smarther-panel'))();
  panel._hass = hass;
  await panel._load();
  assert.equal(panel._cards.length,1,'One complete thermostat per device');
  const widget=panel._cards[0];
  assert.equal(widget._view,'climate');
  assert.equal(calls.length,0,'Dial rendering sends no services');
  states[ids.climate].attributes.vendor_mode='BOOST';
  states[ids.boost_end]={state:new Date(now+90*60000).toISOString(),attributes:{}};
  context.boostHass=hass;context.boostIds=ids;context.boostNow=now;
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow).percent',context),100);
  // Refresh live telemetry so the passage of time remains a valid live sample.
  states[ids.climate].attributes.last_live_message=new Date(now+45*60000).toISOString();
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow+45*60000).percent',context),50);
  states[ids.climate].attributes.last_live_message=new Date(now).toISOString();
  states[ids.boost_end].state=new Date(now+45*60000).toISOString();
  widget._render(true);
  let track=find(widget.shadowRoot,n=>n.className==='boost-track');
  assert.equal(track['aria-valuemax'],'90');
  assert.ok(Number.parseFloat(track.children[0].style.split(':')[1])>49);
  widget.shadowRoot.activeElement={tagName:'INPUT'};
  states[ids.boost_end].state=new Date(now+9*60000).toISOString();
  widget._render();
  assert.ok(Number.parseFloat(track.children[0].style.split(':')[1])<11,'Countdown updates while target field has focus');
  widget.shadowRoot.activeElement=null;
  hass.entities[ids.boost_end].device_id='other';
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow)',context),null,'No cross-device countdown');
  hass.entities[ids.boost_end].device_id='synthetic';
  states[ids.boost_end].state='unavailable';
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow)',context),null);
  states[ids.boost_end].state=new Date(now+45*60000).toISOString();
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow+21*60000)',context),null,'Do not animate stale telemetry');
  states[ids.boost_end].state=new Date(now-60000).toISOString();
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow).percent',context),0);
  states[ids.climate].attributes.vendor_mode='MANUAL';
  assert.equal(vm.runInContext('boostCountdown(boostHass,boostIds,boostNow)',context),null,'Cancelled Boost empties the bar');
  const oldCards=panel._cards;
  await panel._load();assert.equal(panel._cards,oldCards,'Metadata refresh preserves editing');
  widget._activate('temperature');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,0,'Chart navigation is read-only');
  assert.ok(widget._history.chart.data);
  widget._activate('humidity');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queries.filter(q=>q.type==='history/history_during_period').length,1,'Temperature/humidity share bounded history cache');
  assert.ok(textContent(widget.shadowRoot).includes('No recorded data'),'Unknown humidity is not zero');
  widget._activate('boost');
  find(widget.shadowRoot,n=>n.textContent==='60 min').listeners.click();
  assert.equal(widget._boostMinutes,60);assert.equal(calls.length,0,'Duration choice alone is not a command');
  widget._activate('program');assert.equal(calls.length,0);
  await widget._command('climate','set_temperature',ids.climate,{temperature:null});
  assert.equal(calls.length,0,'Blank temperature rejected');
  await widget._command('climate','set_temperature',ids.climate,{temperature:22});
  assert.equal(calls.length,1);assert.equal(states[ids.climate].attributes.temperature,21,'No optimistic state');
  states[ids.climate].attributes.controls_enabled=false;
  await widget._command('button','press',ids.boost_30);
  states[ids.climate].attributes.controls_enabled=true;
  states[ids.climate].attributes.last_live_message='2000-01-01T00:00:00Z';
  await widget._command('button','press',ids.boost_30);
  states[ids.climate].state='unavailable';await widget._command('button','press',ids.boost_30);
  states[ids.climate].state='heat';states[ids.climate].attributes.last_live_message=new Date().toISOString();
  hass.entities[ids.boost_30].device_id='other';await widget._command('button','press',ids.boost_30);
  assert.equal(calls.length,1,'Readonly/stale/unavailable/cross-device commands blocked');
  await widget._command('select','select_option',ids.program,{option:'missing'});
  await widget._command('button','press',ids.cancel_boost);
  assert.equal(calls.length,1,'Invalid option and inactive cancel rejected');
  widget._history={};const originalWS=hass.callWS;
  hass.callWS=async()=>{throw Error('History unavailable');};
  widget._activate('temperature');await new Promise(resolve=>setImmediate(resolve));
  assert.ok(textContent(widget.shadowRoot).includes('History is unavailable'));
  widget._activate('climate');assert.equal(calls.length,1,'Missing Recorder does not block the thermostat or call services');
  hass.callWS=originalWS;
  panel.connectedCallback();widget.connectedCallback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok([...timers.values()].includes(30000)&&[...timers.values()].includes(15000));
  panel.disconnectedCallback();widget.disconnectedCallback();assert.equal(timers.size,0);
  // Real metadata can return multiple entries with renamed, disjoint entities.
  const ids2=Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,id+'_second']));
  for(const [key,id] of Object.entries(ids2)) {
    states[id]=JSON.parse(JSON.stringify(states[ids[key]]));
    hass.entities[id]={device_id:'second'};
  }
  hass.callWS=async()=>({entries:[device,{entry_id:'second',title:'Second thermostat',entities:ids2}]});
  await panel._load();
  assert.equal(panel._cards.length,2,'Every visible Smarther gets its own card');
  assert.equal(panel._cards[0]._ids.climate,ids.climate);
  assert.equal(panel._cards[1]._ids.climate,ids2.climate);
  assert.ok(textContent(panel._cards[1].shadowRoot).includes('Second thermostat'));
  const second=panel._cards[1],before=calls.length;
  await second._command('climate','set_temperature',ids.climate,{temperature:23});
  assert.equal(calls.length,before,'Second card cannot control the first thermostat');
  const midnight=Date.parse('2026-10-24T22:05:00Z');
  context.statsInput=[{lu:Date.parse('2026-10-24T21:55:00Z')/1000,s:'heat',a:{hvac_action:'heating',last_live_message:'2026-10-24T21:55:00Z',control_max_age_seconds:1200}}];
  context.statsEnd=midnight;
  let days=vm.runInContext('recordedHeating(statsInput,statsEnd,"Europe/Rome")',context);
  assert.equal(days[5].heating,5*60000);assert.equal(days[6].heating,5*60000,'Local-midnight split');
  context.statsEnd=Date.parse('2026-10-25T06:00:00Z');
  days=vm.runInContext('recordedHeating(statsInput,statsEnd,"Europe/Rome")',context);
  assert.equal(days.reduce((sum,day)=>sum+day.heating,0),20*60000,'Never extrapolate stale heating across recording gaps');
  context.statsInput=[{lu:Date.parse('2026-10-25T00:55:00Z')/1000,s:'heat',a:{hvac_action:'heating',last_live_message:'2026-10-25T00:55:00Z',control_max_age_seconds:1200}}];
  context.statsEnd=Date.parse('2026-10-25T01:05:00Z');
  assert.equal(vm.runInContext('recordedHeating(statsInput,statsEnd,"Europe/Rome").reduce((n,d)=>n+d.heating,0)',context),10*60000,'Repeated DST hour must not double elapsed minutes');
  context.statsInput[0].s='unavailable';
  assert.equal(vm.runInContext('recordedHeating(statsInput,statsEnd,"Europe/Rome").reduce((n,d)=>n+d.known,0)',context),0);
  assert.equal(vm.runInContext('number(" ")',context),null);
  console.log('PASS thermostat dial, read-only views, history caching/gaps, local midnight, freshness cap and command gates');
}
function find(node,predicate) { if(predicate(node)) return node; for(const child of node?.children||[]) { const found=find(child,predicate); if(found) return found; } }
function textContent(node) { return String(node?.textContent||'')+(node?.children||[]).map(textContent).join(' '); }
main();
