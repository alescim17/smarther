"""Bounded protocol implementation for BTicino Smarther legacy MQTT messages.

Pure Python: this module has no HA, network or filesystem dependencies.
All outgoing commands require a call from an explicitly authorized user action.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
from datetime import datetime, timedelta
from math import isfinite
import re
from xml.etree import ElementTree as ET


MAX_MESSAGE_BYTES = 32 * 1024
VALID_MODES = frozenset({"MANUAL", "AUTOMATIC", "PROTECTION", "BOOST"})
PROFILE_NAME_LIMIT = 80


class ProtocolError(ValueError):
    """Malformed or unsupported device payload."""


@dataclass(frozen=True)
class ThermostatState:
    ambient_c: float | None = None
    humidity_percent: float | None = None
    setpoint_c: float | None = None
    mode: str | None = None
    function: str | None = None
    load_state: str | None = None
    program_number: int | None = None
    boost_end: str | None = None

    def merge(self, other: "ThermostatState") -> "ThermostatState":
        """Preserve previously observed fields absent from a partial update."""
        updates = {
            field.name: getattr(other, field.name)
            for field in fields(self)
            if getattr(other, field.name) is not None
        }
        return replace(self, **updates)


def _parse_xml(payload: str | bytes) -> ET.Element:
    if isinstance(payload, bytes):
        if len(payload) > MAX_MESSAGE_BYTES:
            raise ProtocolError("oversized_payload")
        try:
            payload = payload.decode("utf-8", "strict")
        except UnicodeError as exc:
            raise ProtocolError("invalid_utf8") from exc
    if not isinstance(payload, str) or len(payload.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise ProtocolError("oversized_payload")
    if "<!DOCTYPE" in payload.upper() or "<!ENTITY" in payload.upper():
        raise ProtocolError("unsafe_xml_declaration")
    try:
        node = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise ProtocolError("invalid_xml") from exc
    if node.tag != "OWNMsg":
        raise ProtocolError("unexpected_xml_root")
    return node


def _finite(raw: str | None, low: float, high: float) -> float | None:
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if isfinite(value) and low <= value <= high else None


def _simple_token(raw: str | None, allowed: set[str] | frozenset[str]) -> str | None:
    if raw is None:
        return None
    value = raw.upper()
    return value if value in allowed else None


def parse_state(payload: str | bytes) -> ThermostatState:
    """Extract bounded state from OWNMsg, regardless of Params element order."""
    root = _parse_xml(payload)
    attrs = {}
    for element in root.iter():
        if element.tag in ("Params", "Param"):
            attrs.update(element.attrib)

    program = None
    try:
        number = int(attrs["program_number"])
        if 0 <= number <= 3:
            program = number
    except (ValueError, KeyError):
        pass

    end = attrs.get("end_date_and_time_validity")
    if end:
        try:
            end = datetime.fromisoformat(end).isoformat(timespec="seconds")
        except ValueError:
            end = None
    else:
        end = None

    state = ThermostatState(
        ambient_c=_finite(attrs.get("ambient_temperature_value"), -30, 60),
        humidity_percent=_finite(attrs.get("ambient_relative_humidity_value"), 0, 100),
        setpoint_c=_finite(attrs.get("setpoint"), 0, 45),
        mode=_simple_token(attrs.get("mode"), VALID_MODES),
        function=_simple_token(attrs.get("function"), frozenset({"HEATING", "COOLING"})),
        load_state=_simple_token(
            attrs.get("heating_thermoregulation_load_state"),
            frozenset({"ACTIVE", "INACTIVE"}),
        ),
        program_number=program,
        boost_end=end,
    )
    if all(getattr(state, field.name) is None for field in fields(state)):
        raise ProtocolError("no_thermostat_fields")
    return state


def parse_program_profile(payload: str | bytes) -> str | None:
    """Return a vendor program name, if explicitly valid and safely bounded."""
    root = _parse_xml(payload)
    for node in root.iter():
        if node.tag == "is_creation_date_valid" and (node.text or "").strip().upper() == "FALSE":
            return None
    for node in root.iter():
        if node.tag.lower() == "name" and node.text:
            name = " ".join(node.text.split())
            if name and len(name) <= PROFILE_NAME_LIMIT:
                return name
    return None


def _command(*params: dict[str, str]) -> str:
    """Serialize the conservative legacy SET envelope as proper XML."""
    root = ET.Element("OWNMsg", {"Profile": "V3", "Version": "Official"})
    payload = ET.SubElement(root, "Payload")
    ET.SubElement(payload, "Service", {"TYPE": "SET"})
    ET.SubElement(payload, "SeqID", {
        "ID": "0", "Progress": "0", "Marker": "0", "IsLast": "TRUE"
    })
    ET.SubElement(payload, "Address", {"WHO": "4", "WHERE": ""})
    ET.SubElement(payload, "ActionID").text = "device_state"
    paramlist = ET.SubElement(payload, "ParamList")
    ET.SubElement(paramlist, "Params", {"temperature_format": "CELSIUS"})
    for param in params:
        ET.SubElement(paramlist, "Params", param)
    return ET.tostring(root, encoding="unicode", short_empty_elements=True)


def _target(value: float) -> str:
    if not isfinite(value) or not 8 <= value <= 30:
        raise ProtocolError("invalid_setpoint")
    return f"{value:.5f}"


def command_temperature(value: float) -> str:
    """Explicit heating setpoint: vendor MANUAL mode."""
    return _command(
        {"function": "HEATING"},
        {"mode": "MANUAL"},
        {"use_date_and_time_validity": "FALSE"},
        {"setpoint": _target(value)},
    )


def command_mode(mode: str, setpoint: float | None = None, program: int = 0) -> str:
    """OFF is the vendor protection (anti-freeze), not loss of device power."""
    if mode == "off":
        return _command(
            {"function": "HEATING"}, {"mode": "PROTECTION"},
            {"use_date_and_time_validity": "FALSE"}, {"setpoint": "7.00000"},
        )
    if mode == "heat":
        if setpoint is None:
            raise ProtocolError("setpoint_required")
        return command_temperature(setpoint)
    if mode == "auto":
        if not isinstance(program, int) or not 0 <= program <= 3:
            raise ProtocolError("invalid_program")
        return _command(
            {"function": "HEATING"}, {"mode": "AUTOMATIC"},
            {"use_date_and_time_validity": "FALSE"},
            {"program_number": str(program)},
        )
    raise ProtocolError("unsupported_hvac_mode")


def command_program(program: int) -> str:
    if not isinstance(program, int) or not 0 <= program <= 3:
        raise ProtocolError("invalid_program")
    return command_mode("auto", program=program)


def command_boost(duration_minutes: int, now: datetime) -> str:
    """Create a boost command with explicit timezone-aware local timestamps."""
    if duration_minutes not in (30, 60, 90) or now.tzinfo is None:
        raise ProtocolError("invalid_boost")
    ending = now + timedelta(minutes=duration_minutes)
    return _command(
        {"function": "HEATING"}, {"mode": "BOOST"},
        {
            "use_date_and_time_validity": "TRUE",
            "init_date_and_time_validity": now.strftime("%Y-%m-%dT%H:%M:%S"),
            "end_date_and_time_validity": ending.strftime("%Y-%m-%dT%H:%M:%S"),
        },
    )


def validate_prefix(prefix: str) -> str:
    """Validate an exact MQTT device topic prefix without changing its root.

    MQTT /cro/... and cro/... are distinct topics. Only remove an optional
    final separator, never the initial slash of a vendor/bridge topic.
    """
    if not isinstance(prefix, str):
        raise ProtocolError("invalid_prefix")
    prefix = prefix.strip().rstrip("/")
    body = prefix.lstrip("/")
    if (
        not prefix or len(prefix) > 240
        or any(token in prefix for token in ("+", "#", "\\", "\x00"))
        or any(part in (".", "..") for part in body.split("/"))
        or not re.fullmatch(r"/?[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*", prefix)
        or prefix.endswith(("/device_state", "/device_state/set"))
    ):
        raise ProtocolError("invalid_prefix")
    return prefix
