"""Bound multipart bodies before the form parser; spool to disk beyond 1 MiB."""

import tempfile

from starlette.responses import JSONResponse


class UploadBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") not in {
            "/sources/import",
            "/sources/preview",
        }:
            return await self.app(scope, receive, send)
        state = scope["app"].state
        limit = state.settings.upload_max_bytes + 1024 * 1024
        headers = dict(scope.get("headers", []))
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            length = 0

        async def too_large():
            await JSONResponse(
                {"detail": "Upload request exceeds the size limit."}, status_code=413
            )(scope, receive, send)

        if length > limit:
            return await too_large()
        # Receive exceptions can be wrapped as generic form errors by the ASGI stack.
        # Check the complete bounded body first so chunked uploads reliably receive 413.
        async with state.upload_slots:
            with tempfile.SpooledTemporaryFile(max_size=1024 * 1024) as body:
                total = 0
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    total += len(chunk)
                    if total > limit:
                        return await too_large()
                    body.write(chunk)
                    if not message.get("more_body", False):
                        break
                body.seek(0)
                replayed = False
                remaining = total

                async def replay():
                    nonlocal replayed, remaining
                    if replayed:
                        return await receive()
                    chunk = body.read(65536)
                    remaining -= len(chunk)
                    replayed = remaining == 0
                    return {"type": "http.request", "body": chunk, "more_body": not replayed}

                await self.app(scope, replay, send)
