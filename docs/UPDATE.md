# Update and rollback

Use a compatible native integration version. Before updating, make a supported
Home Assistant backup including configuration, registries and Recorder; back up
an external database separately. Retain the previous compatible version.

Update through the installation method used and follow Home Assistant's restart
requirements. Keep the existing config entry and its options: do not delete and
reconfigure the thermostat for a normal update. Compatible updates preserve entity
IDs, device ID and Recorder history. Check the entry and history after restarting.
Keep other command writers disabled and avoid changing bridge routing or retained
messages during an ordinary update.

To roll back, reinstall the previous compatible native version and restart as
required, retaining the entry and database. If a future version cannot safely be
downgraded, restore the pre-update Home Assistant and Recorder backup. Do not
edit `.storage` directly.
