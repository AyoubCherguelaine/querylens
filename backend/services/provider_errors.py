"""Actionable provider errors without exposing provider bodies or credentials."""

import re

from openai import APIConnectionError, APITimeoutError


def safe_label(value):
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.\[\]-]{1,160}", value):
        return value
    return None


def provider_failure(error):
    status = getattr(error, "status_code", None)
    code = safe_label(getattr(error, "code", None))
    param = safe_label(getattr(error, "param", None))
    diagnostics = {
        "error_type": type(error).__name__,
        "provider_status": status,
        "provider_code": code,
        "provider_param": param,
        "provider_request_id": safe_label(getattr(error, "request_id", None)),
    }
    if isinstance(error, APITimeoutError):
        message, category = (
            "The model request timed out. Retry or increase LLM_TIMEOUT_SECONDS.",
            "model_timeout",
        )
    elif isinstance(error, APIConnectionError):
        message, category = (
            "Cannot connect to the model provider. Check the backend network connection and retry.",
            "provider_connection",
        )
    elif status == 401:
        message, category = (
            "The provider rejected the API key. Check OPENAI_API_KEY and restart the API.",
            "provider_authentication",
        )
    elif status in {403, 404}:
        message, category = (
            "The configured model is unavailable to this account. Check OPENAI_MODEL and provider permissions.",
            "provider_access",
        )
    elif status == 429:
        if code == "insufficient_quota":
            message, category = (
                "The provider account has insufficient quota. Check its billing or usage limits.",
                "provider_quota",
            )
        else:
            message, category = (
                "The provider rate limit was reached. Wait briefly and retry.",
                "provider_rate_limit",
            )
    elif status in {400, 422}:
        if code == "invalid_function_parameters":
            message = "The provider rejected a tool definition. Update the API tool schema before retrying."
        else:
            message = "The provider rejected the model request. Check model compatibility and the request configuration."
        category = "provider_invalid_request"
    else:
        message, category = (
            "The model provider is unavailable. Retry your question.",
            "provider_unavailable",
        )
    return {"error": message, "code": category, "diagnostics": diagnostics}
