# Optional climate dashboard

The integration creates entities, not user dashboards. Marketplace integration
installation/update does not automatically install this example. You can add a
built-in thermostat card to an existing dashboard, or use
[`examples/dashboard.yaml`](../custom_components/bticino_smarther_mqtt/examples/dashboard.yaml).
No third-party card or second updater is required.

To import the complete example, first save a private export of the destination
if it already contains anything. Create a new, user-owned editable dashboard via
Settings → Dashboards. Open it, enter edit mode and the raw configuration editor,
replace `climate.example_smarther` in the example with your existing canonical
entity ID, paste and save. Check the climate card/history before using controls.
For an existing dashboard, add only the example's view/card through its supported
editor; do not replace the complete configuration accidentally.

After import the dashboard belongs to the user (or their HA configuration Git
repository if deliberately managed as YAML). The component's bundled example may
change in later releases, but the imported dashboard is never overwritten.
Removing the example means deleting only the optional view/dashboard through HA's
UI. Integration entries and Recorder remain intact. Use HA's raw configuration
editor for export/restore, never direct `.storage` manipulation.
