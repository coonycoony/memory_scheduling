import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import json
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
import connect as app_module
from connect import app
from notice_model import Notice


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _make_notice(**kwargs):
    defaults = dict(university="테스트대학교", title="공지", url="http://a.com/1", category="장학", date="2024-06-01")
    defaults.update(kwargs)
    return Notice(**defaults)


# ─── /health ─────────────────────────────────────────────────────────────────

class TestHealthCheck:
    def test_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ─── /universities ─────────────────────────────────────────────────────────────

class TestGetUniversities:
    def test_returns_list_from_sources_json(self, client):
        data = {"A대학교": {"name": "A대학교", "boards": []}, "B대학교": {"name": "B대학교", "boards": []}}
        from unittest.mock import mock_open
        m = mock_open(read_data=json.dumps(data, ensure_ascii=False))
        with patch("connect.os.path.exists", return_value=True):
            with patch("connect.open", m):
                resp = client.get("/universities")
        assert resp.status_code == 200
        assert set(resp.json()) == {"A대학교", "B대학교"}

    def test_returns_empty_when_no_sources_file(self, client):
        with patch("connect.os.path.exists", return_value=False):
            resp = client.get("/universities")
        assert resp.status_code == 200
        assert resp.json() == []


# ─── /boards ──────────────────────────────────────────────────────────────────

class TestGetBoards:
    def test_returns_board_list(self, client):
        data = {
            "A대학교": {
                "name": "A대학교",
                "boards": [{"board_name": "장학게시판"}, {"board_name": "학사게시판"}]
            }
        }
        from unittest.mock import mock_open
        m = mock_open(read_data=json.dumps(data, ensure_ascii=False))
        with patch("connect.os.path.exists", return_value=True):
            with patch("connect.open", m):
                resp = client.get("/boards", params={"university": "A대학교"})
        assert resp.status_code == 200
        assert "장학게시판" in resp.json()

    def test_returns_empty_for_unknown_university(self, client):
        data = {"A대학교": {"name": "A대학교", "boards": []}}
        from unittest.mock import mock_open
        m = mock_open(read_data=json.dumps(data, ensure_ascii=False))
        with patch("connect.os.path.exists", return_value=True):
            with patch("connect.open", m):
                resp = client.get("/boards", params={"university": "없는대학교"})
        assert resp.json() == []

    def test_returns_empty_when_no_sources_file(self, client):
        with patch("connect.os.path.exists", return_value=False):
            resp = client.get("/boards", params={"university": "A대학교"})
        assert resp.json() == []


# ─── /notices ─────────────────────────────────────────────────────────────────

class TestGetNotices:
    def test_returns_notices(self, client):
        mock_notices = [_make_notice()]
        with patch("connect.load_notices", return_value=mock_notices):
            resp = client.get("/notices", params={"university": "테스트대학교"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_board_and_category_together_returns_400(self, client):
        resp = client.get("/notices", params={"university": "A대학교", "board": "공지", "category": "장학"})
        assert resp.status_code == 400

    def test_invalid_category_returns_400(self, client):
        resp = client.get("/notices", params={"university": "A대학교", "category": "없는카테고리"})
        assert resp.status_code == 400

    def test_days_less_than_1_returns_400(self, client):
        resp = client.get("/notices", params={"university": "A대학교", "days": 0})
        assert resp.status_code == 400

    def test_empty_result_does_not_crash(self, client):
        with patch("connect.load_notices", return_value=[]):
            resp = client.get("/notices", params={"university": "테스트대학교"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_crawl_exception_returns_500(self, client):
        with patch("connect.load_notices", side_effect=Exception("크롤링 실패")):
            resp = client.get("/notices", params={"university": "테스트대학교"})
        assert resp.status_code == 500


# ─── /sources/url ─────────────────────────────────────────────────────────────

class TestAddSource:
    def test_add_source_success(self, client):
        with patch("connect.analyze_page_urls", return_value={"page_param": "page", "enc_inner_path": None, "enc_query_template": None}):
            with patch("connect.add_board_source"):
                resp = client.post("/sources/url", json={
                    "university": "테스트대학교",
                    "board_name": "공지사항",
                    "url1": "http://example.com/board?page=1",
                    "url2": "http://example.com/board?page=2",
                    "max_pages": 10,
                })
        assert resp.status_code == 200
        assert "추가 완료" in resp.json()["message"]

    def test_add_source_invalid_url_returns_400(self, client):
        with patch("connect.analyze_page_urls", side_effect=ValueError("URL 오류")):
            resp = client.post("/sources/url", json={
                "university": "테스트대학교",
                "board_name": "공지사항",
                "url1": "http://a.com/1",
                "url2": "http://b.com/2",
            })
        assert resp.status_code == 400


# ─── /schedules ───────────────────────────────────────────────────────────────

class TestScheduleEndpoints:
    def test_create_schedule(self, client):
        resp = client.post("/schedules", json={
            "date": "2024-06-01",
            "main_category": "학사",
            "title": "수강신청",
        })
        assert resp.status_code == 200
        assert resp.json()["title"] == "수강신청"

    def test_get_schedules(self, client):
        client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "수강신청"})
        resp = client.get("/schedules")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_get_schedules_with_category_filter(self, client):
        client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "수강신청"})
        client.post("/schedules", json={"date": "2024-06-01", "main_category": "행사", "title": "축제"})
        resp = client.get("/schedules", params={"main_category": "학사"})
        assert all(s["main_category"] == "학사" for s in resp.json())

    def test_update_schedule(self, client):
        create_resp = client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "원래 제목"})
        schedule_id = create_resp.json()["id"]
        resp = client.put(f"/schedules/{schedule_id}", json={"title": "수정된 제목"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "수정된 제목"

    def test_update_nonexistent_schedule_returns_404(self, client):
        resp = client.put("/schedules/9999", json={"title": "없음"})
        assert resp.status_code == 404

    def test_delete_schedule(self, client):
        create_resp = client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "삭제 대상"})
        schedule_id = create_resp.json()["id"]
        resp = client.delete(f"/schedules/{schedule_id}")
        assert resp.status_code == 200

    def test_delete_nonexistent_schedule_returns_404(self, client):
        resp = client.delete("/schedules/9999")
        assert resp.status_code == 404
