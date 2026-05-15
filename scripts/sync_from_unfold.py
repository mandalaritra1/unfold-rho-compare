#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


VERSIONS = ("original", "fixed_jec")
PREVIEW_DIRNAME = "_previews"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync tagged rho preview PNGs into the static comparison app.")
    parser.add_argument(
        "--unfold-root",
        type=Path,
        default=Path("/mnt/extra/wsLinux/unfold"),
        help="Path to the unfold repository.",
    )
    parser.add_argument(
        "--app-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to this comparison app repository.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove existing copied PNGs before syncing.",
    )
    return parser.parse_args()


def copy_version(unfold_root: Path, app_root: Path, version: str, *, clean: bool) -> list[Path]:
    source = unfold_root / "outputs" / "rho" / version / PREVIEW_DIRNAME
    target = app_root / "plots" / version
    if clean and target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)

    copied: list[Path] = []
    if not source.exists():
        print(f"Missing preview source for {version}: {source}")
        return copied

    for png in sorted(source.rglob("*.png")):
        rel = png.relative_to(source)
        out = target / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(png, out)
        copied.append(rel)
    print(f"Synced {len(copied)} PNG previews for {version}")
    return copied


def folder_from_path(path: Path) -> str:
    parent = path.parent.as_posix()
    return parent if parent != "." else "."


def nice_name(path: Path) -> str:
    return path.stem.replace("_", " ")


def build_manifest(app_root: Path, rels_by_version: dict[str, set[Path]]) -> dict:
    all_rels = sorted(set().union(*rels_by_version.values()), key=lambda p: p.as_posix())
    plots = []
    for rel in all_rels:
        files = {}
        for version in VERSIONS:
            if rel in rels_by_version[version]:
                files[version] = (Path("plots") / version / rel).as_posix()
        plots.append(
            {
                "path": rel.as_posix(),
                "folder": folder_from_path(rel),
                "name": nice_name(rel),
                "files": files,
            }
        )

    paired = sum(1 for item in plots if all(version in item["files"] for version in VERSIONS))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "versions": list(VERSIONS),
        "plot_count": len(plots),
        "paired_count": paired,
        "plots": plots,
    }


def main() -> None:
    args = parse_args()
    unfold_root = args.unfold_root.resolve()
    app_root = args.app_root.resolve()

    rels_by_version = {
        version: set(copy_version(unfold_root, app_root, version, clean=args.clean))
        for version in VERSIONS
    }
    manifest = build_manifest(app_root, rels_by_version)
    manifest_path = app_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifest_path}")
    print(f"Paired plots: {manifest['paired_count']} / {manifest['plot_count']}")


if __name__ == "__main__":
    main()
