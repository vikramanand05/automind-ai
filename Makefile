.PHONY: test lint up full
test:
	python -m pytest -q
lint:
	python -m ruff check apps/api tests pipelines scripts
	python -m mypy
up:
	docker compose up --build -d
full:
	docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up --build -d
