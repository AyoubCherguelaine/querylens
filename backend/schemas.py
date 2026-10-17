from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Signup(StrictModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=100)


class Login(StrictModel):
    email: EmailStr
    password: str = Field(max_length=128)


class Group(StrictModel):
    field: str
    grain: Literal["day", "week", "month", "quarter", "year"] | None


class Metric(StrictModel):
    field: str | None
    aggregation: Literal["count", "sum", "avg", "min", "max", "count_distinct"]


class Filter(StrictModel):
    field: str
    operator: Literal["eq", "ne", "gt", "gte", "lt", "lte", "contains", "is_null", "is_not_null"]
    value: str | None


class Plan(StrictModel):
    clarification: str | None
    groups: list[Group] = Field(max_length=5)
    metrics: list[Metric] = Field(max_length=8)
    filters: list[Filter] = Field(max_length=12)
    order_by: str | None  # g0, g1, m0, m1 ...
    descending: bool
    limit: int = Field(ge=1, le=1000)


class SessionCreate(StrictModel):
    cube_id: UUID


class Question(StrictModel):
    question: str = Field(min_length=1, max_length=2000)
    stream: bool = False


class Analysis(StrictModel):
    plan: Plan
