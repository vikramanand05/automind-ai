"""HTTP orchestration keeps the DAG image independent of the application package."""

import json
import os
import urllib.request
from datetime import datetime, timedelta

from airflow.decorators import dag, task


@dag(
    dag_id="automind_production_ingestion",
    schedule=None,
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args={"retries": 2, "retry_delay": timedelta(seconds=30)},
    tags=["automind", "synthetic"],
)
def production_ingestion():
    @task
    def ingest_validate_clean_version_load():
        body = json.dumps({"days": 240, "components": 3, "seed": 42}).encode()
        request = urllib.request.Request(
            os.environ["AUTOMIND_API_URL"] + "/api/v1/production/synthetic",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        if not result["quality"]["valid"]:
            raise ValueError("Dataset quality validation failed")
        return {"version_id": result["id"], "checksum": result["checksum"], "quality": result["quality"]}

    ingest_validate_clean_version_load()


production_ingestion()
