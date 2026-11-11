"""MQTT adapter: exact-topic subscriptions, no own socket or broker control."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from hashlib import sha256
import logging
from zoneinfo import ZoneInfo

from homeassistant.components import mqtt
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError

from .const import CONF_ENABLE_CONTROLS, CONF_TOPIC_PREFIX, MAX_CONTROL_AGE_SECONDS
from .protocol import (
    ProtocolError,
    ThermostatState,
    command_boost,
    command_mode,
    command_program,
    command_temperature,
    parse_program_profile,
    parse_state,
)

_LOGGER = logging.getLogger(__name__)


class SmartherMqttHub:
    """One config entry owns exactly one thermostat and its MQTT callbacks."""

    def __init__(self, hass: HomeAssistant, entry) -> None:
        self.hass = hass
        self.entry = entry
        self.prefix = entry.data[CONF_TOPIC_PREFIX]
        self.stable_id = sha256(self.prefix.encode("utf-8")).hexdigest()[:24]
        self.state = ThermostatState()
        self.programs: dict[int, str] = {}
        self.last_received: datetime | None = None
        self.last_live: datetime | None = None
        self.last_retained: bool | None = None
        self._state_observed = False
        self._unsubscribe: list[Callable[[], None]] = []
        self._listeners: set[Callable[[], None]] = set()
        self._closed = False

    @property
    def device_info(self) -> dict:
        return {
            "identifiers": {("bticino_smarther_mqtt", self.stable_id)},
            "name": self.entry.title,
            "manufacturer": "BTicino",
            "model": "Smarther V1 (MQTT)",
        }

    @property
    def read_only(self) -> bool:
        return not bool(self.entry.options.get(CONF_ENABLE_CONTROLS, False))

    @property
    def has_state(self) -> bool:
        return self._state_observed

    @callback
    def listen(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        return lambda: self._listeners.discard(listener)

    @callback
    def _notify(self) -> None:
        for listener in tuple(self._listeners):
            listener()

    @callback
    def _on_state(self, message) -> None:
        if self._closed:
            return
        try:
            parsed = parse_state(message.payload)
        except ProtocolError as exc:
            # Do not log payloads or private MQTT topic/identifiers.
            _LOGGER.debug("Discarded invalid Smarther message: %s", exc)
            return
        self.state = self.state.merge(parsed)
        self.last_received = datetime.now(timezone.utc)
        self.last_retained = bool(getattr(message, "retain", False))
        if not self.last_retained:
            self.last_live = self.last_received
        self._state_observed = True
        self._notify()

    @callback
    def _on_program(self, number: int, message) -> None:
        if self._closed:
            return
        try:
            name = parse_program_profile(message.payload)
        except ProtocolError:
            return
        if name:
            self.programs[number] = name
        else:
            self.programs.pop(number, None)
        self._notify()

    async def async_start(self) -> None:
        """Subscribe to exact topics. No MQTT command is sent by setup."""
        topics = [
            (f"{self.prefix}/device_state", self._on_state),
        ]
        for idx in range(1, 4):
            @callback
            def on_program(message, number=idx):
                """Keep entity updates on Home Assistant's event loop."""
                self._on_program(number, message)

            topics.append((f"{self.prefix}/device_profile/{idx:02d}", on_program))
        try:
            for topic, callback_fn in topics:
                self._unsubscribe.append(
                    await mqtt.async_subscribe(self.hass, topic, callback_fn, 0)
                )
        except Exception:
            self.close()
            raise

    @callback
    def close(self) -> None:
        self._closed = True
        for unsubscribe in self._unsubscribe:
            unsubscribe()
        self._unsubscribe.clear()
        self._listeners.clear()

    def _require_command_permission(self) -> None:
        if self.read_only:
            raise HomeAssistantError(
                "Smarther control commands are disabled. Enable them in integration options "
                "only after verifying the MQTT bridge and disabling competing legacy control."
            )
        if self.last_live is None:
            raise HomeAssistantError("No non-retained live thermostat message has been observed")
        age = (datetime.now(timezone.utc) - self.last_live).total_seconds()
        if age > MAX_CONTROL_AGE_SECONDS:
            raise HomeAssistantError("Thermostat telemetry is too old to allow control")

    async def _publish(self, payload: str) -> None:
        self._require_command_permission()
        # Never publish retained actuator commands, even if legacy YAML did so.
        await mqtt.async_publish(self.hass, f"{self.prefix}/device_state/set", payload, 0, False)

    async def async_set_mode(self, mode: str) -> None:
        await self._publish(
            command_mode(mode, self.state.setpoint_c, self.state.program_number or 0)
        )

    async def async_set_temperature(self, temperature: float) -> None:
        await self._publish(command_temperature(temperature))

    async def async_select_program(self, program: int) -> None:
        if program and program not in self.programs:
            raise HomeAssistantError("The selected program has not been observed")
        await self._publish(command_program(program))

    async def async_boost(self, duration: int) -> None:
        now = datetime.now(ZoneInfo(self.hass.config.time_zone))
        await self._publish(command_boost(duration, now))

    async def async_cancel_boost(self) -> None:
        """Resume the previous schedule, not an arbitrary manual setpoint.

        The legacy installation's boost-cancel flow resumes AUTO. Require an
        observed program number before doing that; do not guess or create an
        optimistic command if the device didn't report its program.
        """
        if self.state.mode != "BOOST":
            raise HomeAssistantError("Thermostat is not reporting BOOST mode")
        if self.state.program_number is None:
            raise HomeAssistantError("Cannot resume automatic mode: device program is unknown")
        await self._publish(command_program(self.state.program_number))
