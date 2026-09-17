FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    YIBAN_DB_PATH=/tmp/yiban-demo/yiban.db

WORKDIR /app

COPY server.py storage.py pro_scale.py bone_risk.py ./
COPY public ./public

RUN mkdir -p /tmp/yiban-demo \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app /tmp/yiban-demo

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)"

CMD ["python", "server.py"]
