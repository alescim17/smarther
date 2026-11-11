# MQTT and Mosquitto bridge configuration

BTicino Smarther MQTT uses Home Assistant's existing MQTT connection. A separate bridge forwards supported device messages between a **local broker** and the **vendor's remote MQTT service**. The cloud link is a prerequisite; the integration cannot configure vendor credentials automatically.

## Prerequisites

Configure Home Assistant's MQTT integration and a suitable broker first. The Mosquitto broker add-on (Home Assistant OS) or a self-managed Mosquitto installation can be used.

For the Home Assistant OS Mosquitto add-on, enable custom configuration with:

- `customize.active: true`
- `customize.folder: mosquitto`

Additional `*.conf` files can then be kept in `/share/mosquitto/`. This is a path example for Home Assistant OS, **not** a file the Smarther integration creates.

### Bridge configuration template

The following is a **template**, not a ready-to-run configuration. Replace all placeholders with valid information obtained through an authorized and supported process. Keep this file private; do not put it in a Git repository.

```conf
connection smarther
address <VENDOR_MQTT_HOST>:8883
topic /cro/plantid/<PLANT_ID>/gwid/<GATEWAY_ID>/device_state in 0
topic /cro/plantid/<PLANT_ID>/gwid/<GATEWAY_ID>/device_profile/01 in 0
topic /cro/plantid/<PLANT_ID>/gwid/<GATEWAY_ID>/device_profile/02 in 0
topic /cro/plantid/<PLANT_ID>/gwid/<GATEWAY_ID>/device_profile/03 in 0
start_type automatic
try_private false
notifications false
keepalive_interval 300

remote_clientid <UNIQUE_REMOTE_CLIENT_ID>
remote_username <REMOTE_USERNAME>
remote_password <REMOTE_PASSWORD>

cleansession true
local_cleansession true
bridge_protocol_version mqttv50
bridge_tls_version tlsv1.2
bridge_insecure false
bridge_cafile /etc/ssl/certs/ca-certificates.crt
```

**Security and routing:** use certificate verification and a distinct client ID.
This example imports only the four exact telemetry topics. It contains no
outbound command route. Do not forward a wildcard bidirectionally: that can also
forward old retained or queued actuator messages when a bridge starts, independently
of the integration's read-only setting. A command route requires a separate,
authorized safety check of exact direction/topic, retained and queued command
quarantine, and disabled legacy writers before it is configured. Do not clear
retained messages as an incidental installation step. Verify the actual vendor
protocol and existing routing before changing a working installation; the
template itself is not proof that a bridge is connected.

The initial slash in `/cro/...` is significant. MQTT treats `/cro/x` and `cro/x` as different topics.

### Obtaining vendor credentials and identifying your topic

For the **historical Android Thermostat app log procedure** (including the
`Documents/Chronotermostat/` folder, `Eliot_Thermostat_PrtLogYYYY_MM_DD.txt`,
and `TryConnectMQTT` / `SubscribeMQTT` fields), see the
[illustrated, sanitized step-by-step guide](ANDROID_APP_LOGS.md).

The original community instructions were for some older app versions; **the
log location is not verified for current Android app releases**. Do not
treat it as a guaranteed supported retrieval path. The remote broker
credentials belong only in the **private Mosquitto bridge** configuration,
not in this integration's Home Assistant config flow. In the HA UI use
only the exact `/cro/plantid/EXAMPLE/gwid/EXAMPLE` prefix, **without
the historical `/#` wildcard**.

Do not post credentials, real plant or gateway identifiers, client IDs, or complete bridge files in issues or logs. If a password is exposed, rotate it using a legitimate, working procedure and update the bridge in a controlled maintenance window.

## First connection (read-only)

1. Confirm the local MQTT broker is running and Home Assistant's MQTT integration is connected.
2. Verify the remote bridge's connection state and TLS errors using private broker diagnostics. Seeing a local broker running does **not** prove the remote bridge is online.
3. Observe an expected fresh, non-retained `device_state` message without publishing to any `/set` topic.
4. Configure BTicino Smarther MQTT in a separate test Home Assistant instance using the correct device topic prefix.
5. Compare temperature, mode and setpoint with the thermostat and existing controller. Leave controls disabled until a separate, authorized cutover.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| MQTT integration unavailable | Local broker and Home Assistant MQTT configuration |
| Thermostat state missing | Exact topic prefix, subscription, broker bridge and vendor connection |
| Only retained messages received | State may be stale; wait for a fresh non-retained update |
| Local MQTT works; device silent | Cloud connectivity, credentials, client-ID conflict, TLS and topic direction |
| Control disabled | Intended read-only default, or no sufficiently recent live telemetry |
| Home Assistant mode Off differs from power off | Vendor protection/antifreeze semantics |

Do not change production broker options or restart Mosquitto merely to diagnose the integration. Back up the bridge file before any authorized maintenance.

See [Home Assistant MQTT](https://www.home-assistant.io/integrations/mqtt/), the [Mosquitto add-on documentation](https://github.com/home-assistant/apps/blob/master/mosquitto/DOCS.md) and the [Mosquitto bridge options](https://mosquitto.org/man/mosquitto-conf-5.html).
