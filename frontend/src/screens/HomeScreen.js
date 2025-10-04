// HomeScreen.js - Complete Updated Version
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Button,
    Alert,
    ActivityIndicator,
    ScrollView,
    TouchableOpacity
} from 'react-native';
import api, { logoutUser } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ADD THIS IMPORT

const HomeScreen = ({ navigation, route }) => {
    const [userData, setUserData] = useState(null);
    const [adminData, setAdminData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checkInLoading, setCheckInLoading] = useState(false);
    const [checkOutLoading, setCheckOutLoading] = useState(false);
    const [todayAttendance, setTodayAttendance] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);


    const fetchUserData = async () => {
        try {
            setLoading(true);
            console.log('HomeScreen: Fetching dashboard data...');

            // Check if we have a token (using the imported AsyncStorage)
            const token = await AsyncStorage.getItem("access");
            console.log('Token available:', !!token);
            if (token) {
                console.log('Token length:', token.length);
            }

            const response = await api.get('dashboard/');
            console.log('Dashboard response received:', response.status);
            console.log('Dashboard data:', response.data);

            setUserData(response.data);

            const userIsAdmin = response.data.user?.is_admin || false;
            setIsAdmin(userIsAdmin);
            console.log('User is admin:', userIsAdmin);

            if (userIsAdmin) {
                await fetchAdminData();
            } else {
                checkTodayAttendance(response.data);
            }
        } catch (error) {
            console.log('Error fetching user data:', error);
            console.log('Error status:', error.response?.status);
            console.log('Error message:', error.message);
            console.log('Error response data:', error.response?.data);

            // Handle 401 specifically
            if (error.response?.status === 401) {
                Alert.alert(
                    'Session Expired',
                    'Please login again',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                logoutUser();
                                navigation.reset({
                                    index: 0,
                                    routes: [{ name: "Login" }],
                                });
                            }
                        }
                    ]
                );
            } else {
                Alert.alert('Error', 'Failed to load user data: ' + (error.message || 'Unknown error'));
            }
        } finally {
            setLoading(false);
        }
    };

    // Fetch admin-specific data
    const fetchAdminData = async () => {
        try {
            const currentDate = new Date();
            const month = currentDate.getMonth() + 1;
            const year = currentDate.getFullYear();

            const response = await api.get(`admin/dashboard/?month=${month}&year=${year}`);
            setAdminData(response.data);
            console.log('Admin data loaded:', response.data);
        } catch (error) {
            console.log('Error fetching admin data:', error);
            console.log('Admin dashboard might not be accessible');
        }
    };

    // Check if user has attendance for today (only for regular users)
    const checkTodayAttendance = (data) => {
        if (data && data.attendance_this_month) {
            const today = new Date();
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

            const todayRecord = data.attendance_this_month.find(att => {
                const attDate = new Date(att.check_in);
                return attDate >= todayStart && attDate < todayEnd;
            });

            setTodayAttendance(todayRecord);
        }
    };

    // Check-in function for regular users
    const handleCheckIn = async () => {
        try {
            setCheckInLoading(true);
            const response = await api.post('check-in/', {
                check_in: new Date().toISOString()
            });

            Alert.alert('Success', 'Checked in successfully!');
            fetchUserData();
        } catch (error) {
            const errorMsg = error.response?.data?.error || 'Check-in failed';
            Alert.alert('Error', errorMsg);
        } finally {
            setCheckInLoading(false);
        }
    };

    // Check-out function for regular users
    const handleCheckOut = async () => {
        try {
            setCheckOutLoading(true);

            if (!todayAttendance) {
                Alert.alert('Error', 'No check-in record found for today');
                return;
            }

            if (todayAttendance.check_out) {
                Alert.alert('Already Checked Out', 'You have already checked out today.');
                return;
            }

            const response = await api.patch(`check-out/${todayAttendance.id}/`, {});
            Alert.alert('Success', 'Checked out successfully!');
            fetchUserData();
        } catch (error) {
            Alert.alert('Error', 'Failed to check out. Please try again.');
        } finally {
            setCheckOutLoading(false);
        }
    };

    // Navigate to appropriate screen based on user role
    const goToDashboard = () => {
        if (userData) {
            if (isAdmin) {
                navigation.navigate('Admin');
            } else {
                navigation.navigate('Dashboard', { userData });
            }
        }
    };

    // Go directly to admin panel
    const goToAdminPanel = () => {
        navigation.navigate('Admin');
    };

    // Refresh all data
    const handleRefresh = async () => {
        setLoading(true);
        await fetchUserData();
    };

    // Logout function
    const logout = async () => {
        await logoutUser();
        navigation.reset({
            index: 0,
            routes: [{ name: "Login" }],
        });
    };

    useEffect(() => {
        fetchUserData();
    }, []);

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#841584" />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    // ADMIN VIEW
    if (isAdmin) {
        const currentDate = new Date();
        const monthName = currentDate.toLocaleString('default', { month: 'long' });
        const year = currentDate.getFullYear();

        return (
            <ScrollView style={styles.container}>
                {/* Admin Header */}
                <View style={styles.adminHeader}>
                    <Text style={styles.welcomeText}>Welcome Admin!</Text>
                    <Text style={styles.usernameText}>{userData?.user?.username}</Text>
                    <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>ADMIN</Text>
                    </View>
                    <Text style={styles.dateText}>{monthName} {year}</Text>
                </View>

                {/* Admin Quick Stats */}
                <View style={styles.statsSection}>
                    <Text style={styles.sectionTitle}>📊 Quick Admin Overview</Text>
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>
                                {adminData?.total_users || userData?.total_users || '0'}
                            </Text>
                            <Text style={styles.statLabel}>Total Users</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>
                                {adminData?.total_attendance_records || userData?.total_attendance_records || '0'}
                            </Text>
                            <Text style={styles.statLabel}>Today's Records</Text>
                        </View>
                    </View>

                    {/* Additional Stats */}
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>
                                {adminData?.total_hours || '0'}
                            </Text>
                            <Text style={styles.statLabel}>Total Hours</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statNumber}>
                                ₹{adminData?.total_amount ? parseFloat(adminData.total_amount).toFixed(2) : '0.00'}
                            </Text>
                            <Text style={styles.statLabel}>Total Amount</Text>
                        </View>
                    </View>
                </View>

                {/* Admin Actions */}
                <View style={styles.adminActions}>
                    <TouchableOpacity style={styles.adminButton} onPress={goToAdminPanel}>
                        <Text style={styles.adminButtonText}>📊 Full Admin Dashboard</Text>
                        <Text style={styles.adminButtonSubtext}>
                            View detailed reports for {adminData?.total_users || '0'} users
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
                        <Text style={styles.refreshButtonText}>🔄 Refresh Data</Text>
                    </TouchableOpacity>
                </View>

                {/* Quick Users Preview */}


                {/* Logout Button */}
                <View style={styles.logoutSection}>
                    <Button title="Logout" onPress={logout} color="#841584" />
                </View>
            </ScrollView>
        );
    }

    // REGULAR USER VIEW
    return (
        <ScrollView style={styles.container}>
            {/* Header Section */}
            <View style={styles.header}>
                <Text style={styles.welcomeText}>Welcome!</Text>
                <Text style={styles.usernameText}>{userData?.user?.username}</Text>
                {userData?.user?.full_name && (
                    <Text style={styles.fullNameText}>{userData.user.full_name}</Text>
                )}
            </View>

            {/* Check-in/Check-out Section */}
            <View style={styles.attendanceSection}>
                <Text style={styles.sectionTitle}>Today's Attendance</Text>

                {todayAttendance ? (
                    <View style={styles.attendanceStatus}>
                        <Text style={styles.statusText}>
                            ✅ Checked in at: {new Date(todayAttendance.check_in).toLocaleTimeString()}
                        </Text>
                        {todayAttendance.check_out ? (
                            <Text style={styles.statusText}>
                                ✅ Checked out at: {new Date(todayAttendance.check_out).toLocaleTimeString()}
                            </Text>
                        ) : (
                            <View style={styles.buttonContainer}>
                                <Button
                                    title={checkOutLoading ? "Checking Out..." : "Check Out"}
                                    onPress={handleCheckOut}
                                    disabled={checkOutLoading}
                                    color="#FF3B30"
                                />
                                <Text style={styles.helpText}>
                                    You checked in today. Click above to check out.
                                </Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={styles.buttonContainer}>
                        <Button
                            title={checkInLoading ? "Checking In..." : "Check In"}
                            onPress={handleCheckIn}
                            disabled={checkInLoading}
                            color="#4CAF50"
                        />
                        <Text style={styles.helpText}>
                            Click above to check in for today.
                        </Text>
                    </View>
                )}
            </View>

            {/* Quick Stats Section */}
            <View style={styles.statsSection}>
                <Text style={styles.sectionTitle}>Quick Overview</Text>
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{userData?.attendance_this_month?.length || 0}</Text>
                        <Text style={styles.statLabel}>Attendance Days</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>
                            ₹{userData?.current_month_bill?.total_amount || '0'}
                        </Text>
                        <Text style={styles.statLabel}>Current Bill</Text>
                    </View>
                </View>
            </View>

            {/* Dashboard Button */}
            <TouchableOpacity style={styles.dashboardButton} onPress={goToDashboard}>
                <Text style={styles.dashboardButtonText}>View Detailed Dashboard</Text>
            </TouchableOpacity>

            {/* Refresh Button */}
            <TouchableOpacity style={styles.refreshButtonUser} onPress={handleRefresh}>
                <Text style={styles.refreshButtonText}>🔄 Refresh Data</Text>
            </TouchableOpacity>

            {/* Logout Button */}
            <View style={styles.logoutSection}>
                <Button title="Logout" onPress={logout} color="#841584" />
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    // Admin specific styles
    adminHeader: {
        backgroundColor: '#ff6b35',
        padding: 20,
        alignItems: 'center',
    },
    adminBadge: {
        backgroundColor: '#d35400',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 15,
        marginTop: 5,
    },
    adminBadgeText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
    },
    dateText: {
        color: 'white',
        fontSize: 14,
        marginTop: 5,
        opacity: 0.9,
    },
    adminActions: {
        margin: 15,
    },
    adminButton: {
        backgroundColor: '#3498db',
        padding: 20,
        borderRadius: 10,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    adminButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    adminButtonSubtext: {
        color: 'white',
        fontSize: 12,
        opacity: 0.9,
        marginTop: 5,
    },
    refreshButton: {
        backgroundColor: '#ff9800',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 15,
    },
    refreshButtonUser: {
        backgroundColor: '#ff9800',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        margin: 15,
        marginTop: 0,
    },
    refreshButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    usersPreview: {
        backgroundColor: 'white',
        margin: 15,
        padding: 15,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userPreviewItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    userPreviewInfo: {
        flex: 1,
    },
    userPreviewName: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    userPreviewEmail: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    userPreviewStats: {
        alignItems: 'flex-end',
    },
    userPreviewHours: {
        fontSize: 14,
        color: '#841584',
        fontWeight: 'bold',
    },
    userPreviewAmount: {
        fontSize: 12,
        color: '#4caf50',
        fontWeight: '600',
        marginTop: 2,
    },
    moreUsersText: {
        textAlign: 'center',
        color: '#666',
        fontStyle: 'italic',
        marginTop: 10,
    },
    // Regular user styles
    header: {
        backgroundColor: '#841584',
        padding: 20,
        alignItems: 'center',
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 5,
    },
    usernameText: {
        fontSize: 20,
        color: 'white',
        fontWeight: '600',
    },
    fullNameText: {
        fontSize: 16,
        color: 'white',
        opacity: 0.9,
    },
    attendanceSection: {
        backgroundColor: 'white',
        margin: 15,
        padding: 20,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#333',
        textAlign: 'center',
    },
    attendanceStatus: {
        alignItems: 'center',
    },
    statusText: {
        fontSize: 16,
        marginBottom: 10,
        color: '#555',
        textAlign: 'center',
    },
    buttonContainer: {
        alignItems: 'center',
    },
    helpText: {
        fontSize: 12,
        color: '#666',
        marginTop: 10,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    statsSection: {
        backgroundColor: 'white',
        margin: 15,
        padding: 20,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statCard: {
        alignItems: 'center',
        padding: 15,
    },
    statNumber: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#841584',
    },
    statLabel: {
        fontSize: 14,
        color: '#666',
        marginTop: 5,
    },
    dashboardButton: {
        backgroundColor: '#841584',
        margin: 15,
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
    },
    dashboardButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    logoutSection: {
        margin: 20,
    },
    loadingText: {
        marginTop: 20,
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
});

export default HomeScreen;