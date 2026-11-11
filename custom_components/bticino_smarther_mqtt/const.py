"""Shared constants for the independent Smarther MQTT integration."""

DOMAIN = "bticino_smarther_mqtt"
CONF_TOPIC_PREFIX = "topic_prefix"
CONF_ENABLE_CONTROLS = "enable_controls"
CONF_ENABLE_DASHBOARD = "enable_dashboard"
DEFAULT_ENABLE_CONTROLS = False
DEFAULT_ENABLE_DASHBOARD = False
DEFAULT_NAME = "Smarther"
MQTT_DOMAIN = "mqtt"

# Until a vendor-broker heartbeat is qualified, *never* treat a retained
# snapshot or an indefinitely old MQTT message as command authorization.
MAX_CONTROL_AGE_SECONDS = 20 * 60

