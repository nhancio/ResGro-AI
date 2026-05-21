from django.contrib import admin
from django.urls import include, path

from accounts.views import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/accounts/", include("accounts.urls")),
    path("health", health),
]
