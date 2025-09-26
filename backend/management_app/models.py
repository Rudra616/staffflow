from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.timezone import now
from decimal import Decimal

# -----------------------
# 1. User Model
# -----------------------

class User(AbstractUser):
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    full_name = models.CharField(max_length=200, blank=True, null=True)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("100.00"))  
    is_admin = models.BooleanField(default=False)
    
    # Add this field for Django admin compatibility
    is_staff = models.BooleanField(default=False)

    # Remove the property and use the field instead
    def save(self, *args, **kwargs):
        # Automatically set is_staff based on is_admin or is_superuser
        if self.is_admin or self.is_superuser:
            self.is_staff = True
        super().save(*args, **kwargs)

    def has_perm(self, perm, obj=None):
        return self.is_staff
    
    def has_module_perms(self, app_label):
        return self.is_staff

    def __str__(self):
        return f"{self.username} - {self.full_name or ''}"

# -----------------------
# 2. Attendance Model
# -----------------------

class Attendance(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="attendances")
    check_in = models.DateTimeField()
    check_out = models.DateTimeField(null=True, blank=True)

    @property
    def hours_worked(self):
        if self.check_out:
            delta = self.check_out - self.check_in
            return round(delta.total_seconds() / 3600, 2)
        return 0.0

    def __str__(self):
        return f"Attendance for {self.user.username} on {self.check_in.date()}"

# -----------------------
# 3. Bill Model
# -----------------------

class Bill(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="bills")
    month = models.DateField()
    total_hours = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    generated_at = models.DateTimeField(default=now)

    def calculate_totals(self):
        """Calculate totals from attendances"""
        from django.db.models import Sum
        from django.utils.timezone import datetime
        
        # Get first day of the bill month
        month_start = datetime(self.month.year, self.month.month, 1)
        
        # Calculate next month start
        if self.month.month == 12:
            next_month_start = datetime(self.month.year + 1, 1, 1)
        else:
            next_month_start = datetime(self.month.year, self.month.month + 1, 1)
        
        # Sum hours from attendances in this month
        attendances = Attendance.objects.filter(
            user=self.user,
            check_in__gte=month_start,
            check_in__lt=next_month_start
        )
        
        total_hours = sum(a.hours_worked for a in attendances)
        return Decimal(str(total_hours)), Decimal(str(total_hours)) * self.user.hourly_rate

    def save(self, *args, **kwargs):
        # Auto-calculate hours and amount before saving
        if not self.pk:  # New bill
            self.total_hours, self.total_amount = self.calculate_totals()
        else:  # Existing bill - recalculate
            self.total_hours, self.total_amount = self.calculate_totals()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Bill for {self.user.username} - {self.month.strftime('%B %Y')}"