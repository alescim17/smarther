# Optional Smarther dashboard — where it appears

**Current behavior (native integration version 0.1.0b1):** installation
creates the integration's **entities**; it does **not** create a dashboard,
an Overview view, a sidebar item, or a generated YAML file under
`/config/smarther/`. Setup asks for a name and MQTT topic prefix. The
only integration Options toggle controls whether thermostat commands are
allowed; there is **no "Install dashboard" option**.

The historical YAML package used a separate
`bticino_thermostat_dashboard` setting and generated a dedicated
`/config/smarther/dashboard/` layout, including community custom cards.
That mechanism is **not** present in this native integration, and its old
dashboard toggle is not supported here.

The new, much simpler [optional example](../custom_components/bticino_smarther_mqtt/examples/dashboard.yaml)
uses only Home Assistant's **built-in thermostat** and **history graph** cards.
No `layout-card`, `bar-card`, `button-card`, `apexcharts-card`,
`card-mod` or `config-template-card` is required.

## Option A — add the thermostat to an existing dashboard

1. In Home Assistant, open the dashboard where you want the thermostat.
2. Choose **Edit dashboard**, then **Add card**.
3. Select the built-in **Thermostat** card and your actual Smarther climate
   entity (for example, `climate.example_smarther` is only a placeholder).
4. Save through the Home Assistant user interface. If useful, add a separate
   **History graph** card for the same entity.

This does not install or replace any other dashboard or change the MQTT
controller. A thermostat card can show controls, but commands will still be
blocked unless integration controls were separately enabled.

## Option B — create a dedicated Smarther dashboard

1. Open **Settings → Dashboards → Add dashboard**, then choose **New
   dashboard from scratch**. Give it a name such as `Smarther`.
2. Choose whether Home Assistant should **show it in the sidebar**. This is
   where its sidebar entry comes from; no integration installer creates it.
3. Open the newly created dashboard and enter **Edit dashboard**. Use the
   supported **raw configuration editor**, if available in that editor.
4. Copy the YAML from the [bundled example](../custom_components/bticino_smarther_mqtt/examples/dashboard.yaml)
   and replace **every** `climate.example_smarther` with the actual
   `climate.*` entity shown for your installation in
   **Settings → Devices & services → BTicino Smarther MQTT → Entities**.
5. Paste into the **new/empty** dashboard's raw editor, save and verify the
   thermostat/history cards. Do not paste over a populated dashboard unless
   you intentionally want to replace its complete configuration.

For convenience, the example YAML is stored *inside the installed custom
integration* at:

```text
/config/custom_components/bticino_smarther_mqtt/examples/dashboard.yaml
```

It is a **template**, not an auto-created Lovelace dashboard. You can read
it from the [public GitHub repository](../custom_components/bticino_smarther_mqtt/examples/dashboard.yaml)
without browsing Home Assistant's filesystem.

## Ownership, updates and rollback

After you create it, the dashboard is **user-owned**, saved by Home
Assistant through its supported UI (or deliberately managed by you as a
separate YAML dashboard). It is **not** stored inside the integration's
`brand/` or `examples/` folder, and installing/updating Smarther never
overwrites it. Never directly edit Home Assistant `.storage` files.

Back up any existing dashboard before modifying it. A compatible Smarther
integration update preserves the existing config entry/entity identity, so
your cards can continue referring to the same entity. If you deliberately
rename the entity, update the card reference through the UI.

Further reading: [Home Assistant — creating dashboards](https://www.home-assistant.io/dashboards/dashboards/)
and [dashboard ownership/storage](https://contributors.home-assistant.io/architecture/frontend/dashboards/).
