# Automatic Smarther panel

Install and configure the integration normally. **Smarther** then appears in
Home Assistant's sidebar automatically, including on existing installations after
updating to a version with this feature. No dashboard creation, resource
registration, YAML import or extra card installation is required.

The integration serves its own local JavaScript and registers the panel through
Home Assistant's documented `panel_custom.async_register_panel()` interface.
It does not write dashboard/resource storage or overwrite user dashboards.

## Visibility

Each device's Options include **Show this thermostat in the Smarther panel**,
which defaults to **on**. Turn it off to hide that thermostat. When every
thermostat is hidden (or unloaded), the shared sidebar entry is removed. Showing
or loading any visible thermostat restores it. Repeated setup/reload creates
one shared entry, not one duplicate per thermostat.

The flag changes presentation only. It does not reconnect MQTT, enable thermostat
commands, issue Boost or modify setpoints. Command permission remains the
separate **Allow thermostat commands** option, off by default. Changing that
command option retains the integration's normal reload behavior.

Multiple visible thermostats appear as separate widgets on the same page. The
panel resolves registry IDs for each config entry, excludes hidden/disabled
entities, and filters every entity against the signed-in user's read permissions.
A user without access to a thermostat cannot obtain its mapping through the panel
API. Home Assistant also enforces service authorization when a command is sent.
Registry/visibility metadata refreshes while the panel is open, at most every
30 seconds; normal entity-state updates remain live. If the last device is
hidden, the menu entry is removed immediately.

## Thermostat face and statistics

The compact face follows the original Smarther card's visual structure: a large
thermostat dial with current temperature, a setpoint below it, a narrow Boost
indicator and a column of shortcuts. The shortcuts switch locally between the
dial, temperature, humidity, program, Boost, heating statistics and information.
The red vertical Boost bar drains from the top as the reported end time approaches,
on an explicit 0–90 minute scale (the bridge does not report the original duration).
It refreshes every 15 seconds, even while editing a setpoint, and empties when
Boost ends or its telemetry is missing, stale or unavailable. It is independent
of the local duration selector. Each visible configured device gets its own card.
Switching views never calls a thermostat service or creates HA helper entities.

The appearance is inspired by the native HA thermostat and the original YAML
card. It is implemented as a self-contained component instead of patching the
native card's internal CSS. It looks and works the same on direct/cold entry and
after visiting a dashboard; no dashboard-runtime prerequisite or third-party
frontend package is required.

Use +/- or type a target and choose **Apply** (or Enter). Selecting a program
also requires **Apply**. In the Boost view, choosing 30/60/90 minutes is local;
**Start Boost** sends the explicit request. Mode and cancel actions require a
click. Commands recheck read-only, availability, live telemetry, device mapping
and valid values at the gesture boundary. State is never updated optimistically.

Temperature and humidity use Home Assistant's authenticated history API for the
last 24 hours. Minima/maxima describe recorded samples. Unknown/unavailable data
remain gaps rather than zero values. No chart data are generated in production.

The statistics view requests seven days of climate history and sums intervals
whose recorded HVAC action is heating. Each interval is capped by the recorded
last-live timestamp and control age limit, so stale snapshots and missing
intervals are excluded. Days follow Home Assistant's configured timezone,
including midnight/DST boundaries. Labels say **recorded minutes**: partial
history must not be read as complete physical runtime or energy consumption.
Before this integration has recorded those attributes, older days may have no
usable samples. No statistics sensors or recorder data are created or rewritten.

History is fetched when a history/statistics view is opened and cached for one
minute while the panel is open. If history/Recorder is unavailable or excludes
the entity, the card shows an honest unavailable/empty state; thermostat readings
and controls still work. History requires no new manual setup for the panel.

Read-only, unavailable and stale states retain readings/status but block command
controls. Retained snapshots alone do not authorize commands. Backend bridge,
read-only and live-telemetry checks remain authoritative. A successful service
request is not proof that the thermostat applied it.

## Optional personal dashboards

The automatic panel belongs to the integration and is not edited through
Lovelace's **Take control**. Existing personal dashboards remain untouched.

For an independently editable dashboard, the
[native-only example](../custom_components/bticino_smarther_mqtt/examples/dashboard.yaml)
remains available as an optional manual template. Replace its placeholder entity
IDs with your actual IDs. This route is not required for the automatic panel.

Disabling visibility or removing the final integration entry removes the panel,
without deleting user dashboards, entity history or Recorder data. Static assets
remain registered for the current HA process; Home Assistant has no public
static-route removal API. Module URLs include an asset hash so updated bundles
are fetched without a manual Resources entry.

## Italiano

Dopo la normale configurazione dell'integrazione compare automaticamente
**Smarther** nella barra laterale. Non occorre creare dashboard, registrare
risorse JavaScript o importare YAML.

Nelle Options di ciascun dispositivo, **Mostra questo termostato nel pannello
Smarther** è attivo per impostazione predefinita. Disattivandolo il dispositivo
scompare; nascondendo tutti i dispositivi scompare anche la voce nel menu.
Riattivandone uno, il pannello ricompare automaticamente. La visibilità non
abilita comandi e non modifica le dashboard personali.

Il pannello include temperatura, modalità, programma, Boost e telemetria. La grafica riprende il quadrante della card originale, con scorciatoie laterali,
grafici temperatura/umidità e statistiche dei minuti di riscaldamento registrati.
Funziona allo stesso modo anche all’apertura diretta. Sola lettura,
indisponibilità e telemetria obsoleta impediscono i comandi in entrambi i casi.

## References

- [Custom panels](https://contributors.home-assistant.io/frontend/custom-ui/panel/)
- [Async static paths](https://contributors.home-assistant.io/blog/2024/06/18/async_register_static_paths/)
