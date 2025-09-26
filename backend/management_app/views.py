from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from django.utils.timezone import now, localtime
from datetime import timedelta, date
from django.http import HttpResponse
import csv
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import serializers
from decimal import Decimal   
from django.conf import settings  

from .models import User, Attendance, Bill
from .serializers import UserSerializer, AttendanceSerializer, BillSerializer

User = get_user_model()

# -------------------------------
# User registration + listing
# -------------------------------
class UserListCreateView(generics.ListCreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

# -------------------------------
# Check-in View (Fixed)
# -------------------------------
class CheckInView(generics.CreateAPIView):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        # Check if user already checked in today
        today = now().date()
        existing_attendance = Attendance.objects.filter(
            user=self.request.user,
            check_in__date=today
        ).first()
        
        if existing_attendance:
            raise serializers.ValidationError("You have already checked in today.")
        
        # Create new attendance record
        serializer.save(user=self.request.user, check_in=now())

    def create(self, request, *args, **kwargs):
        try:
            response = super().create(request, *args, **kwargs)
            return response
        except serializers.ValidationError as e:
            return Response({"error": str(e)}, status=400)

# -------------------------------
# Check-out View (Fixed)
# -------------------------------
class CheckOutView(generics.UpdateAPIView):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def update(self, request, *args, **kwargs):
        attendance = self.get_object()
        
        # Check if already checked out
        if attendance.check_out:
            return Response({"error": "Already checked out"}, status=400)
        
        # Check if user owns this attendance record
        if attendance.user != request.user:
            return Response({"error": "Not authorized"}, status=403)
        
        attendance.check_out = now()
        attendance.save()
        
        # Force bill recalculation for the month
        bill_month = date(attendance.check_in.year, attendance.check_in.month, 1)
        
        # Get or create bill and force save to recalculate
        bill, created = Bill.objects.get_or_create(
            user=request.user,
            month=bill_month
        )
        # Force recalculation by saving again
        bill.save()
        
        # Get updated attendance data
        updated_attendance = AttendanceSerializer(attendance).data
        
        # Get updated bill data for immediate frontend update
        updated_bill = BillSerializer(bill).data
        
        return Response({
            "attendance": updated_attendance,
            "updated_bill": updated_bill,
            "hours_worked": attendance.hours_worked,
            "message": "Check-out successful"
        })
    
# -------------------------------
# User Dashboard (attendance + bills) - Enhanced
# -------------------------------

class UserDashboardView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        
        # Debug info
        print(f"Dashboard accessed by: {user.username} (Admin: {user.is_admin})")
        
        # ===== ADMIN DASHBOARD =====
        if user.is_admin:
            current_date = now()
            current_month = current_date.month
            current_year = current_date.year
            
            # Admin statistics - real-time calculations
            total_users = User.objects.filter(is_admin=False).count()  # Exclude admins
            total_admins = User.objects.filter(is_admin=True).count()
            
            # Today's attendance count
            today_attendances = Attendance.objects.filter(
                check_in__date=current_date.date()
            ).count()
            
            # Current month statistics
            month_attendances = Attendance.objects.filter(
                check_in__month=current_month,
                check_in__year=current_year
            )
            
            # Calculate real-time totals for admin
            total_hours_this_month = sum(att.hours_worked for att in month_attendances if att.hours_worked)
            
            # Get all users' hourly rates for accurate calculation
            all_users = User.objects.all()
            user_hourly_rates = {u.id: u.hourly_rate for u in all_users}
            
            # Calculate total amount using each user's actual hourly rate
            total_amount_this_month = Decimal('0.00')
            for att in month_attendances:
                if att.hours_worked:  # Only if hours_worked is not None
                    user_rate = user_hourly_rates.get(att.user.id, Decimal('0.00'))
                    total_amount_this_month += Decimal(str(att.hours_worked)) * user_rate

            # Pending check-outs (users checked in but not out today)
            pending_checkouts = Attendance.objects.filter(
                check_in__date=current_date.date(),
                check_out__isnull=True
            ).count()

            data = {
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.full_name,
                    "phone_number": user.phone_number,
                    "is_admin": True,
                    "hourly_rate": float(user.hourly_rate)
                },
                "admin_stats": {
                    "total_users": total_users,
                    "total_admins": total_admins,
                    "today_attendances": today_attendances,
                    "pending_checkouts": pending_checkouts,
                    "total_hours_this_month": float(total_hours_this_month) if total_hours_this_month else 0.0,
                    "total_amount_this_month": float(total_amount_this_month),
                    "attendance_records_this_month": month_attendances.count(),
                },
                "is_admin": True,
                "real_time_calculated_at": current_date.isoformat()
            }
            return Response(data)

        # ===== REGULAR USER DASHBOARD =====
        # Get current date info
        current_date = now()
        current_month = current_date.month
        current_year = current_date.year
        
        # Force recalculation of current month bill
        current_month_start = date(current_year, current_month, 1)
        current_month_bill, created = Bill.objects.get_or_create(
            user=user, 
            month=current_month_start
        )
        if not created:
            current_month_bill.save()  # This triggers recalculation
        
        # Get last month bill and recalculate
        last_month = current_month - 1 if current_month > 1 else 12
        last_month_year = current_year if current_month > 1 else current_year - 1
        last_month_start = date(last_month_year, last_month, 1)
        last_month_bill = Bill.objects.filter(
            user=user, 
            month=last_month_start
        ).first()
        
        if last_month_bill:
            last_month_bill.save()  # Recalculate last month too

        # Get attendance data for current month
        month_attendance = Attendance.objects.filter(
            user=user, 
            check_in__month=current_month, 
            check_in__year=current_year
        ).order_by('-check_in')

        # Today's attendance
        today_attendance = Attendance.objects.filter(
            user=user,
            check_in__date=current_date.date()
        ).first()

        # Real-time calculations (more accurate than bill data)
        total_hours_this_month = sum(att.hours_worked for att in month_attendance if att.hours_worked)
        total_amount_this_month = Decimal(str(total_hours_this_month)) * user.hourly_rate if total_hours_this_month else Decimal('0.00')
        
        # 🟢 FIX #1: Initialize today_hours with a default value
        today_hours = Decimal('0.00')
        if today_attendance and today_attendance.check_out:
            today_hours = Decimal(str(today_attendance.hours_worked)) if today_attendance.hours_worked else Decimal('0.00')
        elif today_attendance and not today_attendance.check_out:
            # Currently checked in - calculate live hours
            current_time = now()
            time_diff = current_time - today_attendance.check_in
            
            # Calculate hours as float first
            live_hours_float = time_diff.total_seconds() / 3600
            
            # Convert to Decimal
            today_hours = Decimal(str(round(live_hours_float, 2)))
        
        # 🟢 FIX #3: Calculate today_earnings - both values are now Decimal
        today_earnings = today_hours * user.hourly_rate

        # Weekly statistics (last 7 days)
        one_week_ago = current_date - timedelta(days=7)
        weekly_attendance = Attendance.objects.filter(
            user=user,
            check_in__gte=one_week_ago
        )
        weekly_hours = sum(att.hours_worked for att in weekly_attendance if att.hours_worked)
        weekly_amount = Decimal(str(weekly_hours)) * user.hourly_rate if weekly_hours else Decimal('0.00')

        # Current status
        current_status = "Checked Out"
        if today_attendance:
            current_status = "Checked In" if not today_attendance.check_out else "Checked Out"

        # Next expected action
        next_action = "Check In"
        if today_attendance and not today_attendance.check_out:
            next_action = "Check Out"

        # Prepare comprehensive response data
        data = {
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "phone_number": user.phone_number,
                "hourly_rate": float(user.hourly_rate),
                "is_admin": False
            },
            "today_attendance": AttendanceSerializer(today_attendance).data if today_attendance else None,
            "attendance_this_month": AttendanceSerializer(month_attendance, many=True).data,
            "attendance_count": month_attendance.count(),
            "current_month_bill": BillSerializer(current_month_bill).data,
            "last_month_bill": BillSerializer(last_month_bill).data if last_month_bill else None,
            
            # Real-time statistics
            "real_time_stats": {
                "total_hours_this_month": float(total_hours_this_month) if total_hours_this_month else 0.0,
                "total_amount_this_month": float(total_amount_this_month),
                "days_worked_this_month": month_attendance.count(),
                "current_hourly_rate": float(user.hourly_rate),
                "today_hours": float(today_hours),
                "weekly_hours": float(weekly_hours) if weekly_hours else 0.0,
                "weekly_amount": float(weekly_amount),
                "current_status": current_status,
                "next_action": next_action
            },
            
            # Quick stats for display
            "quick_stats": {
                "monthly_earnings": float(total_amount_this_month),
                "monthly_hours": float(total_hours_this_month) if total_hours_this_month else 0.0,
                "today_earnings": float(today_earnings),
                "weekly_earnings": float(weekly_amount)
            },
            
            # System info
            "is_admin": False,
            "last_updated": current_date.isoformat(),
            "month_display": current_date.strftime("%B %Y")
        }

        # Add debug info in development
        if settings.DEBUG:
            data["debug"] = {
                "bill_recalculated": not created,
                "attendance_records": month_attendance.count(),
                "calculation_method": "real_time"
            }

        return Response(data)

# -------------------------------
# Admin Dashboard (filter by month) - Enhanced
# -------------------------------
class AdminDashboardView(generics.GenericAPIView):
    permission_classes = [permissions.IsAdminUser]
    authentication_classes = [JWTAuthentication]
    
    def get(self, request, *args, **kwargs):
        try:
            month = int(request.query_params.get('month', now().month))
            year = int(request.query_params.get('year', now().year))
            selected_date = date(year, month, 1)
        except ValueError:
            return Response({"error": "Invalid month or year"}, status=400)

        users = User.objects.all()
        attendances = Attendance.objects.filter(
            check_in__month=month, 
            check_in__year=year
        ).order_by('-check_in')
        
        bills = Bill.objects.filter(month=selected_date)

        # Calculate totals
        total_hours = sum(bill.total_hours for bill in bills)
        total_amount = sum(bill.total_amount for bill in bills)

        data = {
            "selected_month": f"{month:02d}/{year}",
            "total_users": users.count(),
            "total_attendance_records": attendances.count(),
            "total_hours": total_hours,
            "total_amount": total_amount,
            "users": UserSerializer(users, many=True).data,
            "attendances": AttendanceSerializer(attendances, many=True).data,
            "bills": BillSerializer(bills, many=True).data,
        }

        return Response(data)

# -------------------------------
# CSV Download (user-specific bills)
# -------------------------------
class BillCSVDownloadView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        bills = Bill.objects.filter(user=request.user).order_by('-month')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{request.user.username}_bills.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['Month', 'Total Hours', 'Total Amount', 'Generated At', 'Hourly Rate'])

        for bill in bills:
            writer.writerow([
                bill.month.strftime("%B %Y"),
                bill.total_hours,
                bill.total_amount,
                bill.generated_at.strftime("%Y-%m-%d %H:%M"),
                request.user.hourly_rate
            ])
        return response

# -------------------------------
# Admin CSV Download (All Users for Selected Month)
# -------------------------------
class AdminBillCSVDownloadView(generics.GenericAPIView):
    permission_classes = [permissions.IsAdminUser]
    authentication_classes = [JWTAuthentication]
    
    def get(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return Response({"error": "Authentication required"}, status=401)
        
        if not request.user.is_staff and not request.user.is_superuser:
            return Response({"error": "Admin access required"}, status=403)
        
        try:
            month = int(request.query_params.get('month', now().month))
            year = int(request.query_params.get('year', now().year))
            selected_date = date(year, month, 1)
        except ValueError:
            return Response({"error": "Invalid month or year"}, status=400)

        bills = Bill.objects.filter(month=selected_date)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="all_user_bills_{month}_{year}.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['User', 'Full Name', 'Month', 'Total Hours', 'Total Amount', 'Hourly Rate', 'Generated At'])

        for bill in bills:
            writer.writerow([
                bill.user.username,
                bill.user.full_name or '',
                bill.month.strftime("%B %Y"),
                bill.total_hours,
                bill.total_amount,
                bill.user.hourly_rate,
                bill.generated_at.strftime("%Y-%m-%d %H:%M")
            ])
        return response

# -------------------------------
# Test Protected Endpoint
# -------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def test_protected_view(request):
    return Response({
        'message': 'This is a protected endpoint!',
        'user': request.user.username,
        'user_id': request.user.id,
        'full_name': request.user.full_name,
        'email': request.user.email,
        'status': 'Token is valid and user is authenticated'
    })