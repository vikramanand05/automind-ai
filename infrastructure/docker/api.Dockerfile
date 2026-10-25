FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements/base-linux-py312.lock requirements/base-linux-py312.lock
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements/base-linux-py312.lock
COPY pyproject.toml ./
COPY apps/api/automind/__init__.py apps/api/automind/__init__.py
ARG EXTRAS=""
RUN --mount=type=cache,target=/root/.cache/pip if [ -n "$EXTRAS" ]; then pip install -e ".[${EXTRAS}]"; else pip install --no-deps -e .; fi
COPY apps/api apps/api
COPY migrations migrations
COPY alembic.ini ./
COPY experiments/configurations experiments/configurations
COPY datasets/samples datasets/samples
COPY scripts scripts
RUN useradd --create-home --uid 10001 automind && mkdir -p runtime && chown -R automind:automind /app
USER automind
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "automind.main:app", "--host", "0.0.0.0", "--port", "8000"]
