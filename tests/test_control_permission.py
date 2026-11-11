"""Exercise the backend command gate without connecting to an MQTT broker."""

import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "custom_components/bticino_smarther_mqtt/mqtt_bridge.py"
tree = ast.parse(SOURCE.read_text())
method = next(
    method for cls in tree.body if isinstance(cls, ast.ClassDef)
    for method in cls.body if isinstance(method, ast.FunctionDef)
    and method.name == "_require_command_permission"
)


class HomeAssistantError(Exception):
    pass


namespace = {"HomeAssistantError": HomeAssistantError}
exec(compile(ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[])), str(SOURCE), "exec"), namespace)
require_permission = namespace["_require_command_permission"]


class ControlPermissionTests(unittest.TestCase):
    def test_retained_state_with_controls_enabled(self):
        require_permission(SimpleNamespace(read_only=False, has_state=True, last_live=None))

    def test_read_only_and_missing_state_are_rejected(self):
        for read_only, has_state in [(True, True), (False, False), (True, False)]:
            with self.subTest(read_only=read_only, has_state=has_state):
                with self.assertRaises(HomeAssistantError):
                    require_permission(SimpleNamespace(read_only=read_only, has_state=has_state, last_live=None))


if __name__ == "__main__":
    unittest.main()
