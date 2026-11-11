# Optional Smarther dashboard

The dashboard tools are **off by default**. Installing, updating or reloading
Smarther creates no dashboard, adds no sidebar item and changes no thermostat
setting. Enabling the tools opens a guided route to Home Assistant's normal
dashboard creation UI; it does not create or replace a dashboard itself.

The generated dashboard uses the actual entity registry IDs of **one selected
Smarther config entry**. You can create a separate dashboard for each installed
device. The default climate widget uses a native Tile card and the integration's
own small card features. A **Built-in cards only** choice and a completely
manual native example are available. No third-party card package is needed.

## Guided creation

An administrator performs the following one-time setup:

1. Open **Settings → Devices & services → BTicino Smarther MQTT → Configure**
   for the device. Enable the optional dashboard tools and follow the displayed
   instructions. Leave thermostat controls disabled if you only need readings;
   the dashboard option and command permission are separate.
2. Open **Settings → Dashboards**. In the top-right menu, choose **Resources**,
   then **Add resource**. Enter this URL and choose **JavaScript module**:

   ```text
   /bticino_smarther_mqtt/smarther-dashboard.js
   ```

   Add it once for the whole Home Assistant installation. Multiple Smarther
   devices use the same resource. If it already exists, use the existing entry.
3. Reload the browser page. Open **Settings → Dashboards → Add dashboard** and
   select **Smarther** under **Community dashboards**.
4. Select the intended installation from those with dashboard tools enabled.
   The editor prepares its entity mapping without changing the device. Keep
   the integrated widget, or select **Built-in cards only**.
5. Continue through Home Assistant's creation dialog. Choose a title and
   whether to show the dashboard in the sidebar. Use the stable suggested
   URL displayed by the Smarther editor:

   ```text
   smarther-<entry_id in lowercase>
   ```

   This is a Home Assistant config entry ID, not an MQTT identifier. Copy the
   value shown by the editor rather than inventing it.
6. Open the new dashboard. To customize it and preserve the generated layout,
   choose **Edit dashboard → Take control**. Keep the generated cards rather
   than starting from an empty dashboard. Home Assistant saves the editable
   configuration through its normal UI.

The editor also offers a read-only text area containing a **native-only
configuration** for the selected device. JSON is valid YAML: copy it into the raw
configuration editor of a **new, empty dashboard** if you prefer this route.
Once saved as plain native cards, it does not need the JavaScript resource.

The dashboard editor stores a snapshot of the selected entry's actual entity
IDs. Viewing the prepared layout does not need administrator-only discovery
calls. Renaming an entity later can require updating its reference through the
dashboard editor. Recreating a device is not necessary for ordinary updates.

### If Resources is managed in YAML

Use Home Assistant's documented resource configuration instead of the Resources
UI. Merge this into the existing configuration; do not replace other resources:

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /bticino_smarther_mqtt/smarther-dashboard.js
      type: module
```

Reload dashboard resources using Home Assistant's normal action, then reload
the browser. If the Community dashboards entry is absent, first check that
the resource loads and that the browser has been refreshed. The integration
does not modify resource storage for you. See Home Assistant's
[resource instructions](https://contributors.home-assistant.io/frontend/custom-ui/resources/).

## What the widget shows

The default layout keeps the native climate Tile as its host and adds compact
Smarther feature rows. It supports narrow/mobile views without reproducing the
physical thermostat or changing Home Assistant's native climate entity.

| Information or action | Behavior |
| --- | --- |
| Current and target temperature, HVAC mode | Native climate state; explicit controls in the feature rows |
| Program | Available program options from the selected device's program entity |
| Boost | Deliberate actions for 30, 60 or 90 minutes, plus cancel/resume schedule |
| Humidity and heating | Current sensor/climate readings; missing values remain unknown |
| Boost end | Device-reported end time when available; not a dashboard countdown controlling the device |
| Telemetry | Fresh/stale/unknown status from the last live telemetry and the integration's control age limit |
| Read-only or unavailable | Clear status; controls stay disabled when their prerequisites are missing |

The dashboard's creation, preview, opening, state updates and editing are
presentation-only. They never publish MQTT, enable controls or apply a setpoint,
mode, program or Boost. A command requires an explicit interaction. The
backend's existing read-only, bridge and telemetry checks remain authoritative;
the frontend does not bypass them. A successful request is not proof that the
physical thermostat applied it.

Retained MQTT state can supply useful readings without proving a fresh live
connection. The **Last MQTT message** diagnostic is an arrival timestamp;
the widget's control readiness uses the separate live-telemetry timestamp.
Unknown, unavailable or stale readings are not converted into a healthy status.

### Why use a Tile instead of the Thermostat dial by default?

Home Assistant supports custom features in both compatible Tile and Thermostat
cards. The built-in Thermostat dial always presents its native temperature
controls; those controls do not express Smarther's additional read-only and
fresh-telemetry policy. A native Tile with passive default actions and gated
Smarther features keeps that policy visible in one coherent widget, using
documented extension points.

After taking control of a dashboard, you can still add the built-in Thermostat
card, program select or Boost buttons yourself. Native controls remain subject
to the backend policy, but may look usable before the backend rejects a stale
or read-only request. The dashboard never enables integration controls on your
behalf.

## Existing dashboards, repeated setup and multiple devices

The integration does not create, rename, delete or overwrite dashboard storage.
Repeating the Options flow or toggling the tools therefore cannot create a
duplicate. Each device has a distinct suggested URL. If that URL already exists
in the frontend's panels, the editor links to it instead of preparing another
dashboard with the same mapping. An occupied URL is not proof of ownership: the
integration does not change or reclaim it.

Home Assistant's final dialog owns the title, sidebar choice and URL. It can
suggest a different URL when one is occupied, and a user can deliberately create
another dashboard at a different URL. This workflow does **not** promise global
deduplication across arbitrary user-chosen URLs. Reopen the existing dashboard
when repeating setup; do not accept another URL unless you intend a copy.

Taking control freezes the generated card configuration as your editable
dashboard. A dashboard still using the strategy depends on its JavaScript
resource when opened; it is not yet an independent native layout. Existing
dashboards outside this workflow are never touched.

## Native-only and manual fallback

**Built-in cards only** generates a passive climate Tile, sensor rows, native
telemetry-status Markdown and history, without custom feature rows. After
**Take control**, this native-only layout needs no Smarther frontend JavaScript
to render. Until then, it still uses the strategy to produce its cards.

If the resource is missing, blocked or unavailable in Home Assistant safe mode,
the integration and its entities continue to work. A strategy or custom feature
cannot run without its JavaScript; the frontend cannot automatically replace
an unloaded plugin. Use the independent
[native example](../custom_components/bticino_smarther_mqtt/examples/dashboard.yaml)
or add built-in cards directly:

1. Find the actual entity IDs in **Settings → Devices & services →
   BTicino Smarther MQTT → Entities**.
2. Create a **new dashboard from scratch** under **Settings → Dashboards**.
   Set its title and sidebar visibility.
3. In the new, empty dashboard, open the supported raw configuration editor.
   Paste the bundled example after replacing **every placeholder entity ID**.
   Remove rows for entities you have disabled or do not want to show.
4. Save and customize through Home Assistant. Do not paste a complete dashboard
   configuration over an existing populated dashboard.

The example uses a passive Tile, read-only sensor rows, telemetry status and a
history graph. It requires no JavaScript module, third-party cards or optional
dashboard setting. A commented example shows how to add native command cards
deliberately after independently enabling and qualifying thermostat controls.

The installed template is available at:

```text
/config/custom_components/bticino_smarther_mqtt/examples/dashboard.yaml
```

It is a source template, not an automatically imported dashboard. The public
repository link above provides the same file without needing filesystem access.

## Disable, update or roll back

Turning off the dashboard option removes that installation from new dashboard
preparation. It does not delete its dashboard, erase user edits, disable the
thermostat's separate control option or remove a user-registered resource.
The bundled static resource remains available while the integration is installed.
Controls in an existing widget continue to follow the thermostat's separate
command policy.

Before removing the resource, uninstalling the integration or rolling back to
a version without dashboard tools, convert any strategy dashboard to a saved
layout with **Take control**. Replace custom features with built-in cards if
you want it to render without the resource. A frozen native-only layout is the
simplest resource-independent fallback. Save a copy through the raw editor
before making structural changes.

An update preserves config entries, stable unique IDs and Recorder history.
Dashboard generation does not change those identities. If the resource needs
to be refreshed after an update, refresh the browser cache; Home Assistant also
documents version query parameters for resource URLs. Keep only one registration
for this module, and follow release-specific instructions when available.

## Avvio rapido in italiano

1. In **Impostazioni → Dispositivi e servizi → BTicino Smarther MQTT → Configura**,
   abilita gli strumenti dashboard per il dispositivo desiderato. Sono
   disattivati per impostazione predefinita e separati dall'abilitazione comandi.
2. In **Impostazioni → Dashboard → Risorse**, aggiungi una sola volta
   `/bticino_smarther_mqtt/smarther-dashboard.js` come **Modulo JavaScript**.
   Ricarica la pagina del browser.
3. Seleziona **Aggiungi dashboard → Dashboard della community → Smarther**,
   scegli il dispositivo e il widget integrato oppure **Solo schede native**.
4. Nel dialogo di Home Assistant scegli nome e visibilità nella barra laterale;
   usa l'URL suggerito. Se la dashboard esiste già, aprila dal collegamento
   anziché crearne un'altra con un URL differente.
5. Apri la dashboard e usa **Modifica dashboard → Assumi il controllo** per
   salvare il layout e modificarlo. La creazione non invia comandi al termostato.

Disattivare gli strumenti non elimina dashboard o personalizzazioni. Il widget
segnala sola lettura, dati non disponibili e telemetria non recente. I comandi
richiedono un'interazione esplicita e restano protetti dalle verifiche
dell'integrazione. Per eliminare la dipendenza dalla risorsa JavaScript, salva
una configurazione composta solo da schede native oppure usa l'esempio manuale.

## Supported interfaces and scope

Home Assistant 2026.11 supports
[custom card features](https://contributors.home-assistant.io/frontend/custom-ui/card-feature/)
and [custom dashboard strategies](https://contributors.home-assistant.io/frontend/custom-ui/strategy/).
The latter have been discoverable in the creation UI
[since 2026.5](https://contributors.home-assistant.io/blog/2026/04/21/registering-custom-dashboard-strategies/).
The integration serves its bundled module using the documented
[async static-path API](https://contributors.home-assistant.io/blog/2024/06/18/async_register_static_paths/).

There is no documented integration Options API that safely creates and owns
a user-editable Lovelace dashboard for this workflow. Creation therefore remains
an explicit action in Home Assistant's UI. The integration does not manipulate
private dashboard/resource collections, patch frontend components, edit `.storage`
files, or register resources by assuming an internal storage layout. See
[dashboard ownership and storage](https://contributors.home-assistant.io/architecture/frontend/dashboards/)
and [creating dashboards](https://www.home-assistant.io/dashboards/dashboards/).

