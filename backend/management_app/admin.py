from django.contrib import admin
from .models import User, Attendance, Bill

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "full_name", "hourly_rate", "is_admin")

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("user", "check_in", "check_out", "hours_worked")

@admin.register(Bill)
class BillAdmin(admin.ModelAdmin):
    list_display = ("user", "month", "total_hours", "total_amount", "generated_at")