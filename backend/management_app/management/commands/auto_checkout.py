# management/commands/auto_checkout.py
from django.core.management.base import BaseCommand
from django.utils.timezone import now
from management_app.models import Attendance


class Command(BaseCommand):
    help = "Automatically check out all users at 8 PM if they forgot"

    def handle(self, *args, **kwargs):
        current_time = now()
        today = current_time.date()

        # Set checkout to 8 PM today
        checkout_time = current_time.replace(hour=20, minute=0, second=0, microsecond=0)
        if current_time < checkout_time:
            checkout_time = current_time  # prevent setting future times

        open_attendances = Attendance.objects.filter(
            check_in__date=today,
            check_out__isnull=True
        )

        count = open_attendances.update(check_out=checkout_time)

        self.stdout.write(self.style.SUCCESS(
            f"✅ Auto checkout completed for {count} users at {checkout_time}"
        ))
