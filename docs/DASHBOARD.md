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

## Climate widget and native Tile

The panel shows current and target temperature, Off/Heat/Auto, program selection,
Boost 30/60/90 and cancel, humidity, heating, Boost end and telemetry freshness.
Select a temperature/program and press **Apply**; selecting alone sends nothing.
Mode and Boost buttons require an explicit click. State is never updated
optimistically: the displayed outcome comes from Home Assistant telemetry.

Home Assistant's documented `window.loadCardHelpers()` is available only after
its dashboard runtime has loaded. If it is already available, the panel uses
those helpers to create a native climate **Tile** with the bundled Smarther
features. On direct/cold entry without those helpers, a standalone climate widget
shows the same controls and status. Both paths use the same command gates.

This deliberate standalone path avoids loading private HA components or requiring
a preliminary visit to another dashboard. The native Thermostat dial is not the
default because its controls cannot express Smarther's additional read-only and
fresh-telemetry gates. A future HA API could make native Tile availability uniform;
the current panel does not assume that API exists.

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

Il pannello include temperatura, modalità, programma, Boost e telemetria. Usa
la Tile nativa quando i card helper di HA sono già disponibili; all'apertura
diretta funziona comunque con un widget autonomo equivalente. Sola lettura,
indisponibilità e telemetria obsoleta impediscono i comandi in entrambi i casi.

## References

- [Custom panels](https://contributors.home-assistant.io/frontend/custom-ui/panel/)
- [Documented card helpers](https://contributors.home-assistant.io/frontend/custom-ui/card/)
- [Custom card features](https://contributors.home-assistant.io/frontend/custom-ui/card-feature/)
- [Async static paths](https://contributors.home-assistant.io/blog/2024/06/18/async_register_static_paths/)
