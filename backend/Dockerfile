FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend .
ENV PORT=8080
ENV DJANGO_ON_CLOUD_RUN=1
ENV DJANGO_DEBUG=false
EXPOSE 8080
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && python manage.py ensure_superuser && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2"]
