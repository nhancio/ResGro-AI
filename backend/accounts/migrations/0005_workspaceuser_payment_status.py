from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_useractivity"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspaceuser",
            name="payment_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("trialing", "Trialing"),
                    ("active", "Active"),
                    ("past_due", "Past Due"),
                    ("unpaid", "Unpaid"),
                    ("cancelled", "Cancelled"),
                ],
                db_index=True,
                default="pending",
                max_length=32,
            ),
        ),
    ]
