"""Bound streamed request bodies even when Content-Length is absent or inaccurate."""

from starlette.responses import JSONResponse


class UploadTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app, limit: int):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        count = 0

        async def limited_receive():
            nonlocal count
            message = await receive()
            if message["type"] == "http.request":
                count += len(message.get("body", b""))
                if count > self.limit:
                    raise UploadTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except UploadTooLarge:
            response = JSONResponse(
                {"error": {"code": "upload_too_large", "message": "Request body exceeds upload limit"}},
                status_code=413,
            )
            await response(scope, receive, send)
