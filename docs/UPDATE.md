# Install, update and rollback

Use a compatible native integration release from the approved public distribution.
Home Assistant Marketplace/HACS replaces only the component directory. The broker,
bridge, user dashboards, configuration entries and Recorder remain separately owned.

## Before changing versions

Make a supported Home Assistant backup covering configuration, registries and
Recorder; back up any external database separately. Keep the previous compatible
native component archive and its checksum. Record the existing entry, options,
disabled state and entity/device identities privately. Preserve the exact prefix,
domain and IDs. Never delete and re-add the entry as an update technique.

Verify that other legacy writers/installers remain disarmed and that configuration
Git workflows cannot overwrite the custom component. Do not change bridge routing
or publish physical test commands as part of an ordinary software update.

## Apply and verify

Install the selected version through Marketplace/HACS and follow its restart repair
when required. An already loaded integration needs a planned HA restart after a
code update. A manual test installation must follow the same loading requirements.

After startup, verify the installed version, unchanged entries/options and stable
entity/device IDs. Observe fresh telemetry passively, check prior history and look
for duplicates or new errors. Installation does not itself prove device control.

Version 0.1.0b1 keeps config flow schema 1, the domain and the identity algorithm
of 0.1.0b0. Device identity derives from the exact configured prefix; entity unique
IDs use stable suffixes. Current versions do not migrate legacy YAML history,
purge Recorder, import dashboards or enable controls during updates.

## Rollback

Reinstall a prior compatible native version and follow HA's loading/restart
requirements while retaining the entry and database. Do not use the historical
YAML release line or re-enable its writers. If a future entry migration prevents
a compatible downgrade, restore the supported pre-update HA/Recorder backup.
Never hand-edit `.storage` to perform a migration or rollback.

Before compatible public releases exist, retain the private preview artifact and
supported backup for recovery; do not claim a Marketplace-selectable rollback.
