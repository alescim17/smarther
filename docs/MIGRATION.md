# Migration from legacy Smarther YAML

This guide is for an existing Home Assistant installation that previously used
a YAML-based Smarther package or another MQTT thermostat controller. A **fresh**
installation should start with the [README](../README.md) and [MQTT bridge
prerequisites](MOSQUITTO_BRIDGE.md).

## Scope and safety

The native integration is a **separate MQTT client inside Home Assistant**. It
does not configure the remote vendor bridge, import secrets, remove an older
integration, rewrite dashboards or migrate Recorder history automatically.
The legacy YAML updater/release line is **not** a native Marketplace release
and cannot be used to upgrade or roll back this integration.

Never operate two active thermostat command writers against the same physical
device. Never clear retained MQTT messages, disconnect a working bridge or
restart Home Assistant solely as a migration experiment. A local MQTT
connection alone does not demonstrate a working remote bridge.

## Prepare

1. Make a supported Home Assistant backup that includes configuration, entity
   and device registries, and Recorder; back up an external database separately.
   Save an independent private copy of existing MQTT bridge configuration.
2. Privately inventory the existing canonical climate entity, entity/unique IDs,
   helpers, dashboards and automations that read or write the thermostat.
   Keep a post-cutover rollback reference. Never publish actual topic prefixes,
   credentials, personal paths, broker hostnames or MQTT payloads.
3. Confirm that Home Assistant MQTT is working and that the bridge's **inbound**
   telemetry route supplies fresh, non-retained state. Follow the
   [bridge guide](MOSQUITTO_BRIDGE.md), which intentionally does **not** include
   an outbound command route.
4. Disable **legacy writers and installers** before enabling any native
   controls. Existing legacy sensors can remain for read-only consumers and
   Recorder continuity, provided their automations cannot issue commands.

## Introduce the native integration

1. Install a compatible, approved version of BTicino Smarther MQTT via the
   Marketplace/HACS after that version is published. For isolated testing, the
   component can instead be placed manually in the test HA configuration.
2. Add the integration through Settings → Devices & services with the **exact**
   private MQTT prefix, including its initial slash. Never use a wildcard,
   a command suffix, or credentials in the prefix. Start with controls disabled
   (the default).
3. Compare native climate state, temperature and mode against *fresh*
   telemetry. Inspect duplicate entities and IDs before changing dashboards.
   Keep the legacy writer disabled even if the native integration appears idle.
4. Move Lovelace cards, helpers and read-only consumers to the verified native
   entities deliberately. The [optional dashboard](DASHBOARD.md) is an example,
   not an automatic import. Export a dashboard privately before editing it.
5. Treat the switch to a single **active** controller as a separate, explicit
   operational decision. Command routing, stale retained messages and any
   vendor-side device acknowledgement require their own safety verification.
   Do not perform a thermostat SET as a generic installation test.

## Identity, history and recovery

The native integration retains its own config entry, options, device identity,
entity unique IDs and Recorder history through compatible native updates.
Those IDs are deliberately **not** reused from unrelated legacy YAML entities,
so historical observations of the old entities are not reassigned or erased.
Preserve old read-only history instead of attempting a database or `.storage`
rewrite.

For future native updates and rollback, follow the [update guide](UPDATE.md).
If the cutover is not satisfactory, use the supported, private post-cutover
backup and known-good **single-writer** configuration; do not restore a
pre-cutover YAML version that could re-enable unsafe legacy commands.
Any restart, broker change or physical device command on a live installation
requires independent operator authorization.

If migration evidence is uncertain, stop and collect **sanitized diagnostics**
through the [public issue tracker](https://github.com/alescim17/smarther/issues).
Do not attach secrets, real device identifiers, live MQTT payloads, snapshots,
full logs, or private configuration files.
