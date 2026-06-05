import json
import pytest
from unittest.mock import patch, MagicMock, mock_open
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models  # Base에 테이블 등록
from connect import app

SAMPLE_SOURCES = {
    "서울대": {
        "name": "서울대",
        "boards": [{"board_name": "장학공지", "list_url": "http://snu.ac.kr/board"}]
    }
}


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    test_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=test_engine)
    TestSession = sessionmaker(bind=test_engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


# ── /health ───────────────────────────────────────────────────────────────────

def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


# ── /universities ─────────────────────────────────────────────────────────────

def test_get_universities(client):
    sources_json = json.dumps(SAMPLE_SOURCES)
    with patch("connect.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data=sources_json)):
        res = client.get("/universities")
    assert res.status_code == 200
    assert "서울대" in res.json()

def test_get_universities_no_file(client):
    with patch("connect.os.path.exists", return_value=False):
        res = client.get("/universities")
    assert res.status_code == 200
    assert res.json() == []


# ── /boards ───────────────────────────────────────────────────────────────────

def test_get_boards(client):
    sources_json = json.dumps(SAMPLE_SOURCES)
    with patch("connect.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data=sources_json)):
        res = client.get("/boards?university=서울대")
    assert res.status_code == 200
    assert "장학공지" in res.json()

def test_get_boards_no_file(client):
    with patch("connect.os.path.exists", return_value=False):
        res = client.get("/boards?university=서울대")
    assert res.json() == []

def test_get_boards_unknown_university(client):
    sources_json = json.dumps(SAMPLE_SOURCES)
    with patch("connect.os.path.exists", return_value=True), \
         patch("builtins.open", mock_open(read_data=sources_json)):
        res = client.get("/boards?university=없는대학")
    assert res.json() == []


# ── /notices ──────────────────────────────────────────────────────────────────

def test_get_notices_board_and_category_error(client):
    res = client.get("/notices?university=서울대&board=공지&category=장학")
    assert res.status_code == 400

def test_get_notices_invalid_category(client):
    res = client.get("/notices?university=서울대&category=없는카테고리")
    assert res.status_code == 400

def test_get_notices_invalid_days(client):
    res = client.get("/notices?university=서울대&days=0")
    assert res.status_code == 400

def test_get_notices_success(client):
    from notice_model import Notice
    mock_notice = Notice(university="서울대", title="장학금", url="http://snu.ac.kr/1", category="장학", date="2024-06-01")
    with patch("connect.load_notices", return_value=[mock_notice]):
        res = client.get("/notices?university=서울대&days=30")
    assert res.status_code == 200

def test_get_notices_empty_result(client):
    with patch("connect.load_notices", return_value=[]):
        res = client.get("/notices?university=서울대&days=30")
    assert res.status_code == 200
    assert res.json() == []

def test_get_notices_crawl_error(client):
    with patch("connect.load_notices", side_effect=Exception("크롤링 오류")):
        res = client.get("/notices?university=서울대&days=30")
    assert res.status_code == 500


# ── POST /sources/url ─────────────────────────────────────────────────────────

def test_add_source_js_pagination(client):
    with patch("connect.analyze_page_urls", return_value={"page_param": "page", "enc_inner_path": None, "enc_query_template": None}), \
         patch("connect.check_js_pagination", return_value=True):
        res = client.post("/sources/url", json={"university": "A대", "board_name": "공지", "url1": "http://a.com/board#page2"})
    assert res.status_code == 400

def test_add_source_sso_required(client):
    with patch("connect.analyze_page_urls", return_value={"page_param": "page", "enc_inner_path": None, "enc_query_template": None}), \
         patch("connect.check_js_pagination", return_value=False), \
         patch("connect.check_sso_required", return_value=True):
        res = client.post("/sources/url", json={"university": "A대", "board_name": "공지", "url1": "http://a.com/board"})
    assert res.status_code == 403

def test_add_source_invalid_url(client):
    with patch("connect.analyze_page_urls", side_effect=ValueError("URL 오류")):
        res = client.post("/sources/url", json={"university": "A대", "board_name": "공지", "url1": "http://a.com/1", "url2": "http://b.com/2"})
    assert res.status_code == 400

def test_add_source_success(client):
    with patch("connect.analyze_page_urls", return_value={"page_param": "page", "enc_inner_path": None, "enc_query_template": None}), \
         patch("connect.check_js_pagination", return_value=False), \
         patch("connect.check_sso_required", return_value=False), \
         patch("connect.add_board_source"):
        res = client.post("/sources/url", json={"university": "A대", "board_name": "공지", "url1": "http://a.com/board"})
    assert res.status_code == 200


# ── DELETE /sources ───────────────────────────────────────────────────────────

def test_delete_source_unknown_university(client):
    with patch("connect.UNIVERSITY_SOURCES", {}):
        res = client.delete("/sources?university=없는대학&board_name=공지")
    assert res.status_code == 404

def test_delete_source_unknown_board(client):
    from notice_model import NoticeBoard, UniversitySource
    board = NoticeBoard(board_name="다른게시판", list_url="http://a.com")
    sources = {"A대": UniversitySource(name="A대", boards=[board])}
    with patch("connect.UNIVERSITY_SOURCES", sources):
        res = client.delete("/sources?university=A대&board_name=없는게시판")
    assert res.status_code == 404

def test_delete_source_success(client):
    from notice_model import NoticeBoard, UniversitySource
    board = NoticeBoard(board_name="공지", list_url="http://a.com")
    sources = {"A대": UniversitySource(name="A대", boards=[board])}
    with patch("connect.UNIVERSITY_SOURCES", sources), \
         patch("connect.save_sources_to_json"):
        res = client.delete("/sources?university=A대&board_name=공지")
    assert res.status_code == 200

def test_delete_source_last_board_removes_university(client):
    from notice_model import NoticeBoard, UniversitySource
    board = NoticeBoard(board_name="공지", list_url="http://a.com")
    sources = {"A대": UniversitySource(name="A대", boards=[board])}
    with patch("connect.UNIVERSITY_SOURCES", sources), \
         patch("connect.save_sources_to_json"):
        res = client.delete("/sources?university=A대&board_name=공지")
    assert res.status_code == 200

def test_delete_source_save_error(client):
    from notice_model import NoticeBoard, UniversitySource
    board = NoticeBoard(board_name="공지", list_url="http://a.com")
    sources = {"A대": UniversitySource(name="A대", boards=[board])}
    with patch("connect.UNIVERSITY_SOURCES", sources), \
         patch("connect.save_sources_to_json", side_effect=Exception("저장 오류")):
        res = client.delete("/sources?university=A대&board_name=공지")
    assert res.status_code == 500


# ── /schedules ────────────────────────────────────────────────────────────────

def test_create_schedule(client):
    res = client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "중간고사"})
    assert res.status_code == 200
    assert res.json()["title"] == "중간고사"

def test_get_schedules(client):
    client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "중간고사"})
    res = client.get("/schedules")
    assert res.status_code == 200
    assert len(res.json()) >= 1

def test_get_schedules_with_category(client):
    client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "중간고사"})
    res = client.get("/schedules?main_category=학사")
    assert res.status_code == 200

def test_update_schedule(client):
    created = client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "원래제목"}).json()
    res = client.put(f"/schedules/{created['id']}", json={"title": "수정제목"})
    assert res.status_code == 200
    assert res.json()["title"] == "수정제목"

def test_update_schedule_not_found(client):
    res = client.put("/schedules/9999", json={"title": "없는일정"})
    assert res.status_code == 404

def test_delete_schedule(client):
    created = client.post("/schedules", json={"date": "2024-06-01", "main_category": "학사", "title": "삭제"}).json()
    res = client.delete(f"/schedules/{created['id']}")
    assert res.status_code == 200

def test_delete_schedule_not_found(client):
    res = client.delete("/schedules/9999")
    assert res.status_code == 404

