"""Check preparation trust boundaries without downloading a model."""

import hashlib
import importlib.util
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("prepare_jevos", Path(__file__).with_name("prepare-jevos.py"))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PreparationTests(unittest.TestCase):
    def test_verified_archive_extracts_and_bad_checksum_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "model.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("model/model.json", '{"name":"jevos-v4"}')
            prepare.verify(archive, hashlib.sha256(archive.read_bytes()).hexdigest())
            prepare.extract(archive, root / "unpacked")
            self.assertTrue((root / "unpacked/model/model.json").is_file())
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                prepare.verify(archive, "0" * 64)

    def test_archive_cannot_write_outside_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "unsafe.zip"
            with zipfile.ZipFile(archive, "w") as output:
                output.writestr("../escaped", "bad")
            with self.assertRaisesRegex(ValueError, "Unsafe archive path"):
                prepare.extract(archive, root / "unpacked")
            self.assertFalse((root / "escaped").exists())

    def test_tar_links_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "unsafe.tar.gz"
            with tarfile.open(archive, "w:gz") as output:
                member = tarfile.TarInfo("jev/link")
                member.type = tarfile.SYMTYPE
                member.linkname = "../../escaped"
                output.addfile(member)
            with self.assertRaisesRegex(ValueError, "links and special files"):
                prepare.extract(archive, root / "unpacked")


if __name__ == "__main__":
    unittest.main()
