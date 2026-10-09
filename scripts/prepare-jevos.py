"""Download and verify the pinned CPU runtime before going offline."""

import argparse
import hashlib
import platform
import shutil
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

RELEASE = "https://github.com/feder-cr/jev/releases/download/jevos-v4"
ASSETS = {
    "linux": ("jev-linux-x64.tar.gz", "fcfdc62f24cf485d02fe7800569dc301c907242e7fb843e16f3f0f3922d07ac8"),
    "windows": ("jev-windows-x64.zip", "e70f03b008d10a35adbe8313f32238d233182c8eff5df75d9a5b3212834b271d"),
}
MODEL = ("jevos-v4-openvino-int8.zip", "b86c2b55aa97d4f89af5660251a1c943ff9ed52712568bfb4ad44fa734aaeb8c")


def verify(path, expected):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != expected:
        raise ValueError(f"{path.name}: checksum mismatch; nothing will be installed")


def extract(path, destination):
    def safe(name):
        target = (destination / name).resolve()
        if not target.is_relative_to(destination.resolve()):
            raise ValueError(f"Unsafe archive path: {name}")

    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            for member in archive.infolist():
                safe(member.filename)
                if member.external_attr >> 16 & 0o170000 == 0o120000:
                    raise ValueError("Archive symlinks are not allowed")
            archive.extractall(destination)
    else:
        with tarfile.open(path) as archive:
            for member in archive.getmembers():
                safe(member.name)
                if not (member.isfile() or member.isdir()):
                    raise ValueError("Archive links and special files are not allowed")
            archive.extractall(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=ASSETS, default=platform.system().lower())
    args = parser.parse_args()
    if args.platform not in ASSETS:
        parser.error("This setup supports Linux x64 and Windows x64; use --platform linux for Docker")
    if platform.machine().lower() not in ("x86_64", "amd64"):
        parser.error("These pinned binaries require an x64 CPU")
    destination = Path(__file__).resolve().parents[1] / ".vibeguard" / "jevos"
    if destination.exists():
        parser.error(f"{destination} already exists; move it aside before preparing a fresh copy")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temporary:
        staging = Path(temporary)
        for name, checksum in (ASSETS[args.platform], MODEL):
            archive = staging / name
            print(f"Downloading {name}...", flush=True)
            request = urllib.request.Request(f"{RELEASE}/{name}", headers={"User-Agent": "VibeGuard-jevos-setup"})
            with urllib.request.urlopen(request, timeout=60) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
            verify(archive, checksum)
        extract(staging / ASSETS[args.platform][0], staging / "runtime")
        extract(staging / MODEL[0], staging / "runtime" / "jev")
        binary = "jev.exe" if args.platform == "windows" else "jev"
        for name in (binary, "model/model.json", "model/openvino_model.xml", "model/openvino_model.bin", "model/tokenizer.gguf"):
            if not (staging / "runtime" / "jev" / name).is_file():
                raise ValueError(f"Release is missing {name}; nothing will be installed")
        if args.platform == "linux":
            (staging / "runtime" / "jev" / binary).chmod(0o755)
        (staging / "runtime").rename(destination)
    print(f"Prepared jevos-v4 at {destination / 'jev'}. Start instructions: context/jevos-setup.md")


if __name__ == "__main__":
    main()
