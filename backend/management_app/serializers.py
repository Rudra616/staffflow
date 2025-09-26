from rest_framework import serializers
from .models import Attendance, Bill
from django.contrib.auth import get_user_model
from django.utils.timezone import now

User = get_user_model()

# -----------------------
# User Serializer
# -----------------------
class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    is_admin = serializers.BooleanField(read_only=True)  # Add this

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'password', 'phone_number', 'full_name', 'hourly_rate','is_admin']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)  # Hash the password
        user.save()
        return user

# -----------------------
# Attendance Serializer
# -----------------------
class AttendanceSerializer(serializers.ModelSerializer):
    hours_worked = serializers.ReadOnlyField()
    
    class Meta:
        model = Attendance
        fields = ['id', 'user', 'check_in', 'check_out', 'hours_worked']
        read_only_fields = ['user']  # User is set automatically

    def create(self, validated_data):
        # Auto-set the user from request
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

# -----------------------
# Bill Serializer
# -----------------------
class BillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bill
        fields = ['id', 'user', 'month', 'total_hours', 'total_amount', 'generated_at']