FROM automind-api:latest
USER root
RUN pip install --no-cache-dir pytest xgboost-cpu shap
USER automind
COPY tests /app/tests
ENV PYTHONPATH=/app/apps/api
CMD ["python", "-m", "pytest", "-q"]
