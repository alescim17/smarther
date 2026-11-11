"""Shared constants for the independent Smarther MQTT integration."""

DOMAIN = "bticino_smarther_mqtt"
CONF_TOPIC_PREFIX = "topic_prefix"
CONF_ENABLE_CONTROLS = "enable_controls"
CONF_SHOW_PANEL = "show_panel"
DEFAULT_ENABLE_CONTROLS = False
DEFAULT_SHOW_PANEL = True
DEFAULT_NAME = "Smarther"
MQTT_DOMAIN = "mqtt"

# Freshness threshold for telemetry display and recorded heating estimates.
MAX_CONTROL_AGE_SECONDS = 20 * 60

