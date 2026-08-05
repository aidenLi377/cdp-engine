from __future__ import annotations

import io
import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from test_support import create_authenticated_test_app


class ExtensionDownloadTest(unittest.TestCase):
    def setUp(self):
        self.extension_temp = TemporaryDirectory(prefix="cdp-extension-")
        extension_dir = Path(self.extension_temp.name)
        (extension_dir / "manifest.json").write_text(
            json.dumps({"manifest_version": 3, "name": "Test Extension", "version": "2.2.0"}),
            encoding="utf-8",
        )
        (extension_dir / "bridge.js").write_text("console.log('bridge')", encoding="utf-8")
        tests_dir = extension_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "ignored.js").write_text("ignored", encoding="utf-8")
        self.ctx = create_authenticated_test_app(
            test_config={"EXTENSION_DIR": str(extension_dir)}
        )

    def tearDown(self):
        self.ctx.close()
        self.extension_temp.cleanup()

    def test_download_requires_login(self):
        response = self.ctx.app.test_client().get("/api/extension/download")
        self.assertEqual(response.status_code, 401)

    def test_download_returns_fixed_safe_extension_archive(self):
        response = self.ctx.client.get("/api/extension/download")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/zip")
        self.assertIn("DMP_PluginV2.2.0-CDP-Merged.zip", response.headers["Content-Disposition"])
        self.assertIn("no-store", response.headers["Cache-Control"])

        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            names = set(archive.namelist())
        self.assertIn("DMP_PluginV2.2.0-CDP-Merged/manifest.json", names)
        self.assertIn("DMP_PluginV2.2.0-CDP-Merged/bridge.js", names)
        self.assertNotIn("DMP_PluginV2.2.0-CDP-Merged/tests/ignored.js", names)


if __name__ == "__main__":
    unittest.main()
