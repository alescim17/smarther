#!/usr/bin/env python3
"""Build an allowlisted flat Marketplace/HACS integration asset; never publish."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "bticino_smarther_mqtt"
TOP = {"__init__.py", "button.py", "climate.py", "config_flow.py", "const.py",
       "diagnostics.py", "entity.py", "mqtt_bridge.py", "protocol.py", "select.py",
       "sensor.py", "manifest.json", "strings.json", "LICENSE", "NOTICE.md"}
EXTRA = {"translations/en.json", "translations/it.json", "brand/icon.png",
         "brand/icon@2x.png", "examples/dashboard.yaml"}
ALLOWED = TOP | EXTRA


def build(root: Path, output: Path, tag: str | None = None) -> Path:
    component = root / "custom_components" / DOMAIN
    manifest = json.loads((component / "manifest.json").read_text())
    catalog = json.loads((root / "hacs.json").read_text())
    version = manifest["version"]
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:b[0-9]+)?", version):
        raise ValueError("Unsupported release version")
    if tag is not None and tag != "v" + version:
        raise ValueError("Tag must equal v plus manifest version")
    if manifest["domain"] != DOMAIN or not manifest["config_flow"]:
        raise ValueError("Integration identity/config flow changed")
    if catalog.get("zip_release") is not True or catalog.get("filename") != DOMAIN + ".zip":
        raise ValueError("Marketplace asset metadata mismatch")
    if (component / "LICENSE").read_bytes() != (root / "LICENSE").read_bytes():
        raise ValueError("Installed license differs from source license")
    if component.is_symlink() or (root / "custom_components").is_symlink():
        raise ValueError("Symlink component ancestor")
    found = set()
    for path in component.rglob("*"):
        if path.is_symlink():
            raise ValueError("Symlinks are not allowed in release source")
        if not path.is_file():
            continue
        relative = path.relative_to(component).as_posix()
        if "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        if relative not in ALLOWED:
            raise ValueError("Unexpected file in component: " + relative)
        found.add(relative)
        if path.suffix in {".py", ".json", ".md", ".yaml", ".svg"}:
            if re.search(rb"(?:gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]{15,}|-----BEGIN [A-Z ]*PRIVATE KEY)", path.read_bytes()):
                raise ValueError("Potential credential in release source")
    if found != ALLOWED:
        raise ValueError("Missing required package files")
    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / catalog["filename"]
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in sorted(found):
            # Stable paths, permissions and timestamp make repeat builds identical.
            info = zipfile.ZipInfo(relative, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (component / relative).read_bytes())
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    archive_path.with_suffix(".zip.sha256").write_text(f"{digest}  {archive_path.name}\n")
    return archive_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(build(ROOT, args.output, args.tag))
