from django.urls import path
from .views import (
    UserListCreateView,
    CheckInView,
    CheckOutView,
    UserDashboardView,
    AdminDashboardView,
    BillCSVDownloadView,
    AdminBillCSVDownloadView,
    test_protected_view,
)

urlpatterns = [
    # User management
    path('users/', UserListCreateView.as_view(), name='user-list-create'),
    
    # Attendance management
    path('check-in/', CheckInView.as_view(), name='check-in'),
    path('check-out/<int:pk>/', CheckOutView.as_view(), name='check-out'),
    
    # Dashboard views
    path('dashboard/', UserDashboardView.as_view(), name='user-dashboard'),
    path('admin/dashboard/', AdminDashboardView.as_view(), name='admin-dashboard'),
    
    # CSV downloads
    path('bills/download/', BillCSVDownloadView.as_view(), name='bill-csv-download'),
    path('admin/bills/download/', AdminBillCSVDownloadView.as_view(), name='admin-bill-csv-download'),
    
    # Test endpoint
    path('test-protected/', test_protected_view, name='test-protected'),
]