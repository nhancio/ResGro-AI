from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_workspaceuser_status_suspended_last_login"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserActivity",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("activity_type", models.CharField(choices=[("chat", "Chat"), ("session", "Data Session"), ("run", "Agent Run")], db_index=True, max_length=16)),
                ("chat_id", models.CharField(blank=True, db_index=True, max_length=128)),
                ("session_id", models.CharField(blank=True, db_index=True, max_length=128)),
                ("run_id", models.CharField(blank=True, db_index=True, max_length=128)),
                ("agent_name", models.CharField(blank=True, max_length=64)),
                ("status", models.CharField(default="active", max_length=32)),
                ("meta", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activities", to="accounts.workspaceuser")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["user", "activity_type"], name="accounts_us_user_id_b3e5f7_idx"),
                ],
            },
        ),
    ]
