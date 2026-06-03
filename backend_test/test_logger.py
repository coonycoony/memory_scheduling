import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import importlib
from unittest.mock import patch


class TestLogger:
    def test_get_logger_returns_logger(self):
        import logger
        assert logger.app_logger is not None

    def test_creates_log_dir_when_missing(self):
        import logger
        with patch("logger.os.path.exists", return_value=False), \
             patch("logger.os.makedirs") as mock_makedirs:
            importlib.reload(logger)
        mock_makedirs.assert_called_once_with("logs", exist_ok=True)
