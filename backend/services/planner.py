import json
import logging

from openai import AsyncOpenAI, OpenAIError
from pydantic import ValidationError

from backend.schemas import Plan
from backend.services.prompts import PLAN_PROMPT

logger = logging.getLogger(__name__)


class PlannerUnavailable(Exception):
    pass


async def make_plan(cube, question, settings):
    if not settings.openai_api_key.get_secret_value():
        raise PlannerUnavailable(
            "Configure OPENAI_API_KEY to use natural-language analysis; the plan API works without it."
        )
    try:
        async with AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            timeout=settings.llm_timeout_seconds,
            max_retries=1,
        ) as client:
            response = await client.responses.parse(
                model=settings.openai_model,
                instructions=PLAN_PROMPT,
                input=json.dumps({"cube": cube, "question": question}),
                text_format=Plan,
                max_output_tokens=2000,
                store=False,
            )
        if response.status != "completed" or response.output_parsed is None:
            raise PlannerUnavailable(
                "The model could not produce a complete plan. Please rephrase the question."
            )
        logger.info(
            "analysis.plan",
            extra={
                "model": settings.openai_model,
                "tokens": response.usage.total_tokens if response.usage else 0,
            },
        )
        return response.output_parsed
    except (OpenAIError, ValidationError) as error:
        logger.warning("analysis.provider_failed", extra={"error_type": type(error).__name__})
        raise PlannerUnavailable(
            "The analysis model is unavailable. Retry or use the structured plan endpoint."
        ) from error
