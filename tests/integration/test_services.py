import os

import pytest


@pytest.mark.services
def test_postgres_persistence_and_redis():
    url = os.environ.get("SERVICE_DATABASE_URL")
    if not url:
        pytest.skip("Set SERVICE_DATABASE_URL and SERVICE_REDIS_URL for real infrastructure tests")
    import redis
    from sqlalchemy import create_engine, text

    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TEMPORARY TABLE automind_probe (value INTEGER)"))
        connection.execute(text("INSERT INTO automind_probe VALUES (42)"))
        assert connection.scalar(text("SELECT value FROM automind_probe")) == 42
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0002"
    broker = redis.Redis.from_url(os.environ.get("SERVICE_REDIS_URL", "redis://localhost:6379/0"))
    assert broker.ping()
