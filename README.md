# BTicino Smarther MQTT for Home Assistant

![Smarther icon](custom_components/bticino_smarther_mqtt/brand/icon.png)

A community integration for compatible BTicino Smarther thermostats. It uses
Home Assistant MQTT and a separately configured vendor-cloud Mosquitto bridge.
It provides climate readings, heating diagnostics, program selection and Boost
controls, with English and Italian UI translations.

Version **0.1.0b1** is a prerelease candidate. Availability in the public catalog
and publication of a versioned release require separate approval.

## Requirements

Home Assistant **2026.11.0+**, its MQTT integration, a broker and a compatible
thermostat with an independently validated TLS-authenticated bridge are required.
This integration does not retrieve vendor credentials or manage the broker.
See [bridge prerequisites](docs/MOSQUITTO_BRIDGE.md).

New entries are read-only. Setup, reconnect and update do not issue thermostat
commands. Enable controls explicitly only after isolating other writers and
verifying bridge routing and fresh device telemetry. MQTT publish success alone
does not prove a physical command was applied. Off requests protection/antifreeze.

## Install

After an approved public release is available, add that public repository to
Home Assistant Marketplace/HACS as an integration repository and select its
compatible native version. Follow any displayed restart repair, then open
Settings → Devices & services → Add integration → BTicino Smarther MQTT.

Enter a name and the exact private prefix ending before `/device_state`, including
the leading slash. A generic example is `/cro/plantid/EXAMPLE/gwid/EXAMPLE`.
Do not enter credentials, wildcards or command suffixes. Wait for actual telemetry
and keep controls disabled until the independent command-safety checks pass.

For isolated evaluation, manually copy `custom_components/bticino_smarther_mqtt`
into the test HA configuration and follow its normal custom-integration loading
process. Private repositories are not supported by the public HACS path.

## Update, history and rollback

Read [the update guide](docs/UPDATE.md). If migrating from an older YAML-based
Smarther configuration, follow [the migration guide](docs/MIGRATION.md) first.
Keep the existing native entry, prefix, options,
entity/device identities and Recorder database. Do not delete and re-add the
thermostat for an update. Retain a supported backup and the previous compatible
native release; the historical YAML package is not a compatible rollback target.

An [optional dashboard](custom_components/bticino_smarther_mqtt/examples/dashboard.yaml)
uses built-in cards; see [import instructions](docs/DASHBOARD.md). Import is an
explicit user action. Integration installation/update never replaces dashboards.

## Help and attribution

Use the issue tracker of the approved public distribution. Share only sanitized
version/error information, never credentials, device identifiers, prefixes or raw
MQTT payloads. A broker connection alone does not prove the vendor bridge is live.

[MIT licensed](LICENSE), preserving [attribution and provenance](docs/PROVENANCE.md).
The geometric icon is original project artwork. This community project is not
affiliated with or endorsed by BTicino, Legrand, Netatmo or Home Assistant.
