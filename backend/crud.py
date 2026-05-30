from sqlalchemy.orm import Session
import models 

def create_notice(db: Session, univ: str, title: str, url: str, cat: str, date: str):
    db_notice = models.NoticeModel(
            university=univ, title=title, url=url, category=cat, date=date
    )
    db.add(db_notice)
    db.commit()
    db.refresh(db_notice)
    return db_notice
def get_notices(db: Session, university: str, skip: int = 0, limit: int = 100):
    return db.query(models.NoticeModel).filter(
            models.NoticeModel.university == university
    ).offset(skip).limit(limit).all()
def bulk_insert_notices(db: Session, notices: list):
    # 배열로 들어온 공지사항들을 한 번에 넣기 위한 뼈대
    inserted_count = 0
    for n in notices:
        create_notice(db, n.university, n.title, n.url, n.category, n.date)
        inserted_count += 1
    return inserted_count
