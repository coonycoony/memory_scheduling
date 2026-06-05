import asyncio
from unittest.mock import AsyncMock, MagicMock
from middleware import log_requests_middleware


def run(coro):
    return asyncio.run(coro)


class TestLogRequestsMiddleware:
    def test_middleware_calls_next(self):
        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_request.client.host = "127.0.0.1"

        mock_response = MagicMock()
        mock_response.status_code = 200
        call_next = AsyncMock(return_value=mock_response)

        response = run(log_requests_middleware(mock_request, call_next))

        call_next.assert_called_once_with(mock_request)
        assert response.status_code == 200

    def test_middleware_handles_no_client(self):
        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/notices"
        mock_request.client = None

        mock_response = MagicMock()
        mock_response.status_code = 201
        call_next = AsyncMock(return_value=mock_response)

        response = run(log_requests_middleware(mock_request, call_next))
        assert response is not None

    def test_middleware_returns_response(self):
        mock_request = MagicMock()
        mock_request.method = "DELETE"
        mock_request.url.path = "/schedules/1"
        mock_request.client.host = "10.0.0.1"

        mock_response = MagicMock()
        mock_response.status_code = 204
        call_next = AsyncMock(return_value=mock_response)

        result = run(log_requests_middleware(mock_request, call_next))
        assert result == mock_response

