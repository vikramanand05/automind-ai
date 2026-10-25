import asyncio

from automind.body_limit import BodyLimitMiddleware


def test_stream_without_content_length_is_bounded():
    async def scenario():
        chunks = iter(
            [
                {"type": "http.request", "body": b"123", "more_body": True},
                {"type": "http.request", "body": b"456", "more_body": False},
            ]
        )
        sent = []

        async def receive():
            return next(chunks)

        async def send(message):
            sent.append(message)

        async def application(scope, receive, send):
            await receive()
            await receive()

        middleware = BodyLimitMiddleware(application, limit=5)
        await middleware({"type": "http"}, receive, send)
        assert sent[0]["status"] == 413

    asyncio.run(scenario())
