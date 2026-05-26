import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR.parent / ".env.gcp")
load_dotenv(BASE_DIR.parent / "resgro-landing" / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-in-production")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() in ("1", "true", "yes")
ON_CLOUD_RUN = os.environ.get("DJANGO_ON_CLOUD_RUN", "").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]
if ON_CLOUD_RUN and ".run.app" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(".run.app")

if ON_CLOUD_RUN or not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = True

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "accounts",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

database_url = os.environ.get("DATABASE_URL", "").strip()
if database_url:
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    parsed = urlparse(database_url)
    qs = parse_qs(parsed.query)
    # Cloud SQL Unix socket: ?host=/cloudsql/PROJECT:REGION:INSTANCE
    host = qs.get("host", [None])[0] or parsed.hostname or "localhost"
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": (parsed.path or "/resgro").lstrip("/"),
            "USER": parsed.username or "",
            "PASSWORD": parsed.password or "",
            "HOST": host,
            "PORT": str(parsed.port or 5432) if not host.startswith("/") else "",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
# Serve admin CSS/JS in local dev without a stale gunicorn process missing collectstatic
WHITENOISE_USE_FINDERS = DEBUG
WHITENOISE_AUTOREFRESH = DEBUG
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:8888,http://localhost:3000"
    ).split(",")
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
    if o.strip()
]
for origin in CORS_ALLOWED_ORIGINS:
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_SELFSERVE_PRICE_ID = os.environ.get("STRIPE_SELFSERVE_PRICE_ID", "")
STRIPE_AUTONOMY_PRICE_ID = os.environ.get("STRIPE_AUTONOMY_PRICE_ID", "")
APP_ORIGIN = os.environ.get("APP_ORIGIN", "https://app.resgro.ai")
EXPOSE_RESET_TOKEN_IN_API_RESPONSE = os.environ.get(
    "EXPOSE_RESET_TOKEN_IN_API_RESPONSE", ""
).lower() in ("1", "true", "yes")
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")

RESGRO_ADMIN_EMAILS = [
    e.strip().lower()
    for e in os.environ.get(
        "RESGRO_ADMIN_EMAILS", "nithin@theondemandcompany.com,demo@resgro.ai"
    ).split(",")
    if e.strip()
]
