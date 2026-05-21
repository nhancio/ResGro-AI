from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_workspaceuser_reset_expiry_workspaceuser_reset_token"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspaceuser",
            name="status",
            field=models.CharField(
                choices=[("active", "Active"), ("suspended", "Suspended"), ("cancelled", "Cancelled")],
                db_index=True,
                default="active",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="workspaceuser",
            name="suspended_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workspaceuser",
            name="suspended_reason",
            field=models.TextField(blank=True, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="workspaceuser",
            name="last_login_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
