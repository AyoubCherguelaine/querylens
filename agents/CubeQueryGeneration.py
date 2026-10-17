"""Compatibility coordinator; SQL is compiled from a validated plan."""

from backend.core.config import get_settings
from backend.services.compiler import compile_plan
from backend.services.planner import make_plan


class CubeQueryGeneration:
    def __init__(self, cube):
        self.cube = cube

    async def run(self, user_question: str):
        settings = get_settings()
        plan = await make_plan(self.cube, user_question, settings)
        if plan.clarification:
            return {"clarification": plan.clarification}
        sql, parameters, limit = compile_plan(self.cube, plan, settings.max_result_rows)
        return {"sql": sql, "parameters": parameters, "limit": limit, "plan": plan.model_dump()}
