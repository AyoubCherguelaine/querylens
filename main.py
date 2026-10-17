"""Stable ASGI entrypoint: uvicorn main:app."""

from backend.app import create_app

app = create_app()
