import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
import crud
import models


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


class TestCreateNotice:
    def test_create_notice_success(self, db):
        notice = crud.create_notice(db, "테스트대학교", "공지 제목", "http://example.com/1", "장학", "2024-06-01")
        assert notice.id is not None
        assert notice.university == "테스트대학교"
        assert notice.title == "공지 제목"
        assert notice.url == "http://example.com/1"
        assert notice.category == "장학"

    def test_create_notice_duplicate_url_returns_existing(self, db):
        first = crud.create_notice(db, "테스트대학교", "공지 제목", "http://example.com/1", "장학", "2024-06-01")
        second = crud.create_notice(db, "다른대학교", "다른 제목", "http://example.com/1", "학사", "2024-06-02")
        assert first.id == second.id

    def test_create_notice_unique_urls_both_saved(self, db):
        crud.create_notice(db, "테스트대학교", "공지1", "http://example.com/1", "장학", "2024-06-01")
        crud.create_notice(db, "테스트대학교", "공지2", "http://example.com/2", "학사", "2024-06-02")
        count = db.query(models.NoticeModel).count()
        assert count == 2


class TestGetNotices:
    def setup_notices(self, db):
        crud.create_notice(db, "A대학교", "장학금 공지", "http://a.com/1", "장학", "2024-06-01")
        crud.create_notice(db, "A대학교", "수강신청 공지", "http://a.com/2", "학사", "2024-05-01")
        crud.create_notice(db, "B대학교", "채용 공지", "http://b.com/1", "취업/채용", "2024-06-01")

    def test_get_notices_by_university(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "A대학교")
        assert len(result) == 2
        assert all(n.university == "A대학교" for n in result)

    def test_get_notices_sorted_by_date_desc(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "A대학교")
        assert result[0].date == "2024-06-01"
        assert result[1].date == "2024-05-01"

    def test_get_notices_with_category_filter(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "A대학교", category="장학")
        assert len(result) == 1
        assert result[0].category == "장학"

    def test_get_notices_empty_university(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "없는대학교")
        assert result == []

    def test_get_notices_limit(self, db):
        for i in range(5):
            crud.create_notice(db, "A대학교", f"공지{i}", f"http://a.com/{i}", "기타", "2024-06-01")
        result = crud.get_notices(db, "A대학교", limit=3)
        assert len(result) == 3


class TestBulkInsertNotices:
    def test_bulk_insert_success(self, db):
        notices = [
            models.NoticeModel(university="테스트대학교", title=f"공지{i}", url=f"http://example.com/{i}", category="기타", date="2024-06-01")
            for i in range(3)
        ]
        count = crud.bulk_insert_notices(db, notices)
        assert count == 3

    def test_bulk_insert_skips_duplicate(self, db):
        crud.create_notice(db, "테스트대학교", "공지0", "http://example.com/0", "기타", "2024-06-01")
        notices = [
            models.NoticeModel(university="테스트대학교", title=f"공지{i}", url=f"http://example.com/{i}", category="기타", date="2024-06-01")
            for i in range(3)
        ]
        count = crud.bulk_insert_notices(db, notices)
        total = db.query(models.NoticeModel).count()
        assert total == 3

    def test_bulk_insert_rollback_on_error(self, db):
        from unittest.mock import patch
        notices = [
            models.NoticeModel(university="테스트대학교", title="공지0", url="http://example.com/0", category="기타", date="2024-06-01")
        ]
        with patch("crud.create_notice", side_effect=Exception("DB 에러")):
            count = crud.bulk_insert_notices(db, notices)
        assert count == 0


class TestGetUniversityList:
    def test_returns_distinct_universities(self, db):
        crud.create_notice(db, "A대학교", "공지1", "http://a.com/1", "기타", "2024-06-01")
        crud.create_notice(db, "A대학교", "공지2", "http://a.com/2", "기타", "2024-06-02")
        crud.create_notice(db, "B대학교", "공지3", "http://b.com/1", "기타", "2024-06-01")
        result = crud.get_university_list(db)
        assert set(result) == {"A대학교", "B대학교"}

    def test_empty_db_returns_empty(self, db):
        assert crud.get_university_list(db) == []


class TestGetBoardList:
    def test_returns_distinct_categories(self, db):
        crud.create_notice(db, "A대학교", "공지1", "http://a.com/1", "장학", "2024-06-01")
        crud.create_notice(db, "A대학교", "공지2", "http://a.com/2", "장학", "2024-06-02")
        crud.create_notice(db, "A대학교", "공지3", "http://a.com/3", "학사", "2024-06-01")
        result = crud.get_board_list(db, "A대학교")
        assert set(result) == {"학사", "장학"}

    def test_wrong_university_returns_empty(self, db):
        crud.create_notice(db, "A대학교", "공지1", "http://a.com/1", "장학", "2024-06-01")
        assert crud.get_board_list(db, "없는대학교") == []


class TestCreateSchedule:
    def test_create_schedule_basic(self, db):
        schedule = crud.create_schedule(db, "2024-06-01", "학사", "수강신청 기간")
        assert schedule.id is not None
        assert schedule.date == "2024-06-01"
        assert schedule.main_category == "학사"
        assert schedule.title == "수강신청 기간"

    def test_create_schedule_with_optional_fields(self, db):
        schedule = crud.create_schedule(
            db, "2024-06-01", "학사", "졸업식",
            sub_category="행사",
            start_date="2024-06-01",
            end_date="2024-06-01",
            memo="졸업식 안내",
            url="http://example.com/grad",
        )
        assert schedule.sub_category == "행사"
        assert schedule.memo == "졸업식 안내"
        assert schedule.url == "http://example.com/grad"


class TestGetSchedules:
    def setup_schedules(self, db):
        crud.create_schedule(db, "2024-03-01", "학사", "수강신청")
        crud.create_schedule(db, "2024-06-15", "행사", "축제")
        crud.create_schedule(db, "2024-09-01", "학사", "개강")

    def test_get_all_schedules(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db)
        assert len(result) == 3

    def test_get_schedules_sorted_asc(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db)
        dates = [r.date for r in result]
        assert dates == sorted(dates)

    def test_get_schedules_with_category_filter(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db, main_category="학사")
        assert len(result) == 2
        assert all(r.main_category == "학사" for r in result)

    def test_get_schedules_limit(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db, limit=2)
        assert len(result) == 2


class TestUpdateSchedule:
    def test_update_schedule_title(self, db):
        schedule = crud.create_schedule(db, "2024-06-01", "학사", "원래 제목")
        updated = crud.update_schedule(db, schedule.id, {"title": "수정된 제목"})
        assert updated.title == "수정된 제목"

    def test_update_schedule_multiple_fields(self, db):
        schedule = crud.create_schedule(db, "2024-06-01", "학사", "제목")
        updated = crud.update_schedule(db, schedule.id, {"title": "새 제목", "memo": "메모 추가"})
        assert updated.title == "새 제목"
        assert updated.memo == "메모 추가"

    def test_update_nonexistent_schedule_returns_none(self, db):
        result = crud.update_schedule(db, 9999, {"title": "없음"})
        assert result is None


class TestDeleteSchedule:
    def test_delete_schedule_success(self, db):
        schedule = crud.create_schedule(db, "2024-06-01", "학사", "삭제할 일정")
        result = crud.delete_schedule(db, schedule.id)
        assert result is True
        assert db.query(models.ScheduleModel).filter_by(id=schedule.id).first() is None

    def test_delete_nonexistent_schedule_returns_false(self, db):
        result = crud.delete_schedule(db, 9999)
        assert result is False
