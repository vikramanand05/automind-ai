import os
import tempfile
from pathlib import Path

import pytest

_root = Path(tempfile.mkdtemp(prefix="automind-tests-"))
os.environ["DATABASE_URL"] = "sqlite:///" + str(_root / "test.db")
os.environ["STORAGE_DIR"] = str(_root)
os.environ["TRAINING_ENABLED"] = "false"
os.environ["EMBEDDING_MODE"] = "hashing"
os.environ["API_KEY"] = ""

from automind.db import Base, SessionLocal, engine  # noqa: E402
from automind.main import app, rate_windows  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    rate_windows.clear()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
