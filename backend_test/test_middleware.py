import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from middleware import log_requests_middleware


class TestLogRequestsMiddleware:
    def test_logs_request_and_response(self):
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url.path = "/notices"
        mock_request.client.host = "127.0.0.1"

        mock_response = MagicMock()
        mock_response.status_code = 200

        call_next = AsyncMock(return_value=mock_response)

        with patch("middleware.app_logger") as mock_logger:
            result = asyncio.run(log_requests_middleware(mock_request, call_next))

        assert result == mock_response
        assert mock_logger.info.call_count == 2

    def test_handles_missing_client(self):
        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/schedules"
        mock_request.client = None

        mock_response = MagicMock()
        mock_response.status_code = 201

        call_next = AsyncMock(return_value=mock_response)

        with patch("middleware.app_logger") as mock_logger:
            result = asyncio.run(log_requests_middleware(mock_request, call_next))

        assert result == mock_response
        logged_msg = mock_logger.info.call_args_list[0][0][0]
        assert "unknown" in logged_msg
