"""Build a deterministic import fixture from the reviewed source tree."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent
source = root / "customer-tracker"
with ZipFile(root / "customer-tracker.zip", "w", compression=ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        if not file.is_file():
            continue
        if file.is_symlink():
            raise ValueError(f"Links are not allowed: {file}")
        entry = ZipInfo(file.relative_to(source).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, file.read_bytes())
print(root / "customer-tracker.zip")
