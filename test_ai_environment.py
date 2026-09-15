from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cdp_backend.app_factory import load_local_environment


class ProductionAiEnvironmentTests(unittest.TestCase):
    def test_production_loads_only_ai_settings_and_preserves_process_values(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / "ai.env"
            env_path.write_text(
                "\n".join(
                    [
                        "CDP_AI_API_KEY=file-key",
                        "CDP_AI_MODEL=file-model",
                        "SECRET_KEY=must-not-be-loaded",
                    ]
                ),
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {
                    "FLASK_ENV": "production",
                    "CDP_AI_ENV_PATH": str(env_path),
                    "CDP_AI_MODEL": "process-model",
                },
                clear=True,
            ):
                load_local_environment()

                self.assertEqual(os.environ["CDP_AI_API_KEY"], "file-key")
                self.assertEqual(os.environ["CDP_AI_MODEL"], "process-model")
                self.assertNotIn("SECRET_KEY", os.environ)


if __name__ == "__main__":
    unittest.main()
