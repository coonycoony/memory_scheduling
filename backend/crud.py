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
