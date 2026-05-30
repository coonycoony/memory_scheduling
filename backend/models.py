from sqlalchemy import Column, Integer, String
from database import Base

class NoticeModel(Base):
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, index=True)
    university = Column(String, index=True)
    title=Column(String, nullable=False)
    url = Column(String, unique=True, index=True, nullable=False)
    category = Column(String, index=True)
    date = Column(String)
