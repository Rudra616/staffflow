import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import api, { getUserRole } from '../api';
import { Picker } from '@react-native-picker/picker';
import { writeAsStringAsync, documentDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';

const DashboardScreen = ({ route, navigation }) => {
    const [userData, setUserData] = useState(route.params?.userData || {});
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [downloadingBill, setDownloadingBill] = useState(false);

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Update current time every minute for live display
    useEffect(() => {
        const timeInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);

        return () => clearInterval(timeInterval);
    }, []);

    // Auto-refresh data every 5 minutes
    useEffect(() => {
        const autoRefreshInterval = setInterval(() => {
            refreshData();
        }, 300000);

        return () => clearInterval(autoRefreshInterval);
    }, []);

    // Refresh data function
    const refreshData = useCallback(async () => {
        setRefreshing(true);
        try {
            const response = await api.get('dashboard/');
            setUserData(response.data);
            setLastUpdated(new Date());
            console.log('Data refreshed successfully');
        } catch (error) {
            console.error('Error refreshing data:', error);
            Alert.alert('Refresh Error', 'Failed to refresh data. Please try again.');
        }
        setRefreshing(false);
    }, []);

    // Calculate real-time totals
    const calculateRealTimeTotals = (attendanceList, hourlyRate) => {
        const totalHours = attendanceList.reduce((sum, attendance) => {
            return sum + (parseFloat(attendance.hours_worked) || 0);
        }, 0);

        const totalAmount = totalHours * parseFloat(hourlyRate);

        return {
            totalHours: totalHours.toFixed(2),
            totalAmount: totalAmount.toFixed(2)
        };
    };

    // Calculate today's live hours if checked in
    const calculateLiveHours = (todayAttendance) => {
        if (!todayAttendance || todayAttendance.check_out) return 0;

        const checkInTime = new Date(todayAttendance.check_in);
        const current = new Date();
        const diffMs = current - checkInTime;
        const hours = diffMs / (1000 * 60 * 60);

        return Math.max(0, hours.toFixed(2));
    };

    // Format time difference for display
    const formatDuration = (hours) => {
        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);
        return `${wholeHours}h ${minutes}m`;
    };

    // Download individual user bill (PDF)
    const downloadUserBillPDF = async () => {
        try {
            setDownloadingBill(true);

            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                        .company-info { margin-bottom: 30px; }
                        .bill-info { margin-bottom: 20px; }
                        .user-info { margin-bottom: 20px; }
                        .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        .table th { background-color: #f2f2f2; }
                        .total { font-weight: bold; font-size: 16px; text-align: right; }
                        .footer { margin-top: 30px; text-align: center; color: #666; }
                        .period { background-color: #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Monthly Bill Statement</h1>
                        <h2>${monthNames[selectedMonth - 1]} ${selectedYear}</h2>
                    </div>
                    
                    <div class="period">
                        <h3>Billing Period: ${monthNames[selectedMonth - 1]} 1, ${selectedYear} - ${monthNames[selectedMonth - 1]} ${new Date(selectedYear, selectedMonth, 0).getDate()}, ${selectedYear}</h3>
                    </div>
                    
                    <div class="company-info">
                        <h3>Company Information</h3>
                        <p><strong>Company:</strong> Your Company Name</p>
                        <p><strong>Address:</strong> Company Address Here</p>
                        <p><strong>Contact:</strong> contact@company.com | +91-XXXXXXXXXX</p>
                    </div>
                    
                    <div class="user-info">
                        <h3>Employee Information</h3>
                        <p><strong>Name:</strong> ${userData.user?.full_name || userData.user?.username}</p>
                        <p><strong>Username:</strong> ${userData.user?.username}</p>
                        <p><strong>Email:</strong> ${userData.user?.email}</p>
                        <p><strong>Phone:</strong> ${userData.user?.phone_number || 'N/A'}</p>
                        <p><strong>Employee ID:</strong> ${userData.user?.id}</p>
                        <p><strong>Hourly Rate:</strong> ₹${parseFloat(userData.user?.hourly_rate || 0).toFixed(2)}</p>
                    </div>
                    
                    <div class="bill-info">
                        <h3>Bill Details for ${monthNames[selectedMonth - 1]} ${selectedYear}</h3>
                        <table class="table">
                            <tr>
                                <th>Description</th>
                                <th>Details</th>
                                <th>Amount</th>
                            </tr>
                            <tr>
                                <td>Total Hours Worked</td>
                                <td>Based on attendance records</td>
                                <td>${getBillData()?.total_hours || 0} hours</td>
                            </tr>
                            <tr>
                                <td>Hourly Rate</td>
                                <td>Standard rate</td>
                                <td>₹${parseFloat(userData.user?.hourly_rate || 0).toFixed(2)}/hour</td>
                            </tr>
                            <tr>
                                <td><strong>Total Amount</strong></td>
                                <td><strong>Calculated amount</strong></td>
                                <td><strong>₹${parseFloat(getBillData()?.total_amount || 0).toFixed(2)}</strong></td>
                            </tr>
                        </table>
                    </div>
                    
                    <div class="footer">
                        <p>Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                        <p>This is a computer-generated bill. No signature required.</p>
                        <p>Bill ID: ${userData.user?.id}-${selectedMonth}-${selectedYear}</p>
                    </div>
                </body>
                </html>
            `;

            const fileName = `${userData.user?.username}_bill_${selectedMonth}_${selectedYear}.pdf`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;

            const { uri } = await Print.printToFileAsync({
                html: htmlContent,
                base64: false
            });

            // Move to correct location with desired file name
            await FileSystem.moveAsync({
                from: uri,
                to: fileUri
            });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { // <-- FIXED: using the moved file
                    mimeType: 'application/pdf',
                    dialogTitle: `Bill - ${userData.user?.username} - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
                    UTI: 'com.adobe.pdf'
                });
            } else {
                Alert.alert('Success', `PDF bill generated: ${fileName}`);
            }
        } catch (error) {
            console.log('PDF generation error:', error);
            Alert.alert('Error', 'Failed to generate PDF bill');
        } finally {
            setDownloadingBill(false);
        }
    };

    // Download individual user bill (CSV)
    const downloadUserBillCSV = async () => {
        try {
            setDownloadingBill(true);

            const response = await api.get(
                `bills/download/?month=${selectedMonth}&year=${selectedYear}`,
                { responseType: 'blob' }
            );

            const reader = new FileReader();
            reader.readAsText(response.data);

            reader.onloadend = async () => {
                try {
                    const csvString = reader.result;
                    const fileUri = documentDirectory + `${userData.user?.username}_bill_${selectedMonth}_${selectedYear}.csv`;

                    await writeAsStringAsync(fileUri, csvString, {
                        encoding: 'utf8'
                    });

                    if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(fileUri, {
                            mimeType: 'text/csv',
                            dialogTitle: `Download Bill - ${userData.user?.username}`
                        });
                    } else {
                        Alert.alert('Success', `Bill downloaded for ${monthNames[selectedMonth - 1]} ${selectedYear}`);
                    }
                } catch (error) {
                    Alert.alert('Error', 'Failed to save the file');
                } finally {
                    setDownloadingBill(false);
                }
            };
        } catch (error) {
            Alert.alert('Error', `Failed to download bill for ${monthNames[selectedMonth - 1]} ${selectedYear}`);
            setDownloadingBill(false);
        }
    };

    // Handle bill download with format selection
    const handleBillDownload = () => {
        Alert.alert(
            `Download Bill - ${monthNames[selectedMonth - 1]} ${selectedYear}`,
            'Choose your preferred format:',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Download PDF',
                    onPress: downloadUserBillPDF
                },
                {
                    text: 'Download CSV',
                    onPress: downloadUserBillCSV
                }
            ]
        );
    };

    // Get bill data for selected month/year
    const getBillData = () => {
        // This would ideally come from your backend API
        // For now, we'll calculate based on available data
        if (selectedMonth === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear()) {
            return userData.current_month_bill;
        } else if (selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear()) {
            return userData.last_month_bill;
        }
        return null;
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `₹${parseFloat(amount || 0).toFixed(2)}`;
    };

    // Real-time calculations
    const realTimeStats = calculateRealTimeTotals(
        userData.attendance_this_month || [],
        parseFloat(userData.user?.hourly_rate || 0)
    );

    const liveTodayHours = calculateLiveHours(userData.today_attendance);
    const liveTodayAmount = liveTodayHours * parseFloat(userData.user?.hourly_rate || 0);

    // Refresh control for pull-to-refresh
    const onRefresh = useCallback(() => {
        refreshData();
    }, [refreshData]);

    if (!userData.user) {
        return (
            <View style={styles.loadingContainer}>
                <Text>Loading dashboard...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            {/* Header with Last Updated */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    {userData.is_admin ? 'Admin Dashboard' : 'User Dashboard'}
                </Text>
                <Text style={styles.lastUpdated}>
                    Last updated: {lastUpdated.toLocaleTimeString()}
                </Text>
            </View>

            {/* Bill Download Section */}
            <View style={styles.billDownloadSection}>
                <Text style={styles.sectionTitle}>📄 Download Your Bill</Text>

                <View style={styles.periodSelector}>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerLabel}>Month:</Text>
                        <Picker
                            selectedValue={selectedMonth}
                            style={styles.picker}
                            onValueChange={setSelectedMonth}
                        >
                            {monthNames.map((month, index) => (
                                <Picker.Item key={index + 1} label={month} value={index + 1} />
                            ))}
                        </Picker>
                    </View>

                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerLabel}>Year:</Text>
                        <Picker
                            selectedValue={selectedYear}
                            style={styles.picker}
                            onValueChange={setSelectedYear}
                        >
                            {Array.from({ length: 5 }, (_, i) => {
                                const year = new Date().getFullYear() - 2 + i;
                                return <Picker.Item key={year} label={year.toString()} value={year} />
                            })}
                        </Picker>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.downloadBillButton, downloadingBill && styles.downloadButtonDisabled]}
                    onPress={handleBillDownload}
                    disabled={downloadingBill}
                >
                    <Text style={styles.downloadBillButtonText}>
                        {downloadingBill ? 'Generating...' : `Download ${monthNames[selectedMonth - 1]} ${selectedYear} Bill`}
                    </Text>
                </TouchableOpacity>

                {/* Bill Preview */}
                <View style={styles.billPreview}>
                    <Text style={styles.billPreviewTitle}>Bill Preview</Text>
                    <View style={styles.billPreviewInfo}>
                        <Text style={styles.billPreviewText}>
                            Period: {monthNames[selectedMonth - 1]} {selectedYear}
                        </Text>
                        <Text style={styles.billPreviewText}>
                            Total Hours: {getBillData()?.total_hours || 'Calculating...'}
                        </Text>
                        <Text style={styles.billPreviewText}>
                            Total Amount: {formatCurrency(getBillData()?.total_amount)}
                        </Text>
                        <Text style={styles.billPreviewText}>
                            Status: {getBillData() ? 'Available' : 'No data for selected period'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Current Status Card */}
            <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Current Status</Text>
                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Status:</Text>
                    <Text style={[
                        styles.statusValue,
                        userData.real_time_stats?.current_status === 'Checked In' ? styles.statusActive : styles.statusInactive
                    ]}>
                        {userData.real_time_stats?.current_status || 'Checked Out'}
                    </Text>
                </View>

                {userData.real_time_stats?.current_status === 'Checked In' && (
                    <View style={styles.liveSession}>
                        <Text style={styles.liveSessionText}>🟢 Live Session</Text>
                        <Text style={styles.liveSessionHours}>
                            Current: {formatDuration(liveTodayHours)}
                        </Text>
                        <Text style={styles.liveSessionEarnings}>
                            Earned: ₹{liveTodayAmount.toFixed(2)}
                        </Text>
                    </View>
                )}

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Next Action:</Text>
                    <Text style={styles.statusValue}>
                        {userData.real_time_stats?.next_action || 'Check In'}
                    </Text>
                </View>
            </View>

            {/* Quick Stats Grid */}
            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>₹{realTimeStats.totalAmount}</Text>
                    <Text style={styles.statLabel}>Monthly Earnings</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{realTimeStats.totalHours}h</Text>
                    <Text style={styles.statLabel}>Monthly Hours</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                        ₹{userData.quick_stats?.today_earnings?.toFixed(2) || '0.00'}
                    </Text>
                    <Text style={styles.statLabel}>Today's Earnings</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                        {userData.attendance_count || 0}
                    </Text>
                    <Text style={styles.statLabel}>Days Worked</Text>
                </View>
            </View>

            {/* Real-time Statistics */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Real-time Statistics</Text>
                <InfoRow
                    label="Total Hours (Live)"
                    value={`${realTimeStats.totalHours} hours`}
                />
                <InfoRow
                    label="Total Amount (Live)"
                    value={`₹${realTimeStats.totalAmount}`}
                />
                <InfoRow
                    label="Hourly Rate"
                    value={`₹${userData.user.hourly_rate}`}
                />
                <InfoRow
                    label="Weekly Hours"
                    value={`${userData.real_time_stats?.weekly_hours?.toFixed(2) || '0.00'} hours`}
                />
                <InfoRow
                    label="Weekly Earnings"
                    value={`₹${userData.real_time_stats?.weekly_amount?.toFixed(2) || '0.00'}`}
                />
            </View>

            {/* Personal Information */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                <InfoRow label="Username" value={userData.user.username} />
                <InfoRow label="Full Name" value={userData.user.full_name} />
                <InfoRow label="Email" value={userData.user.email} />
                <InfoRow label="Phone" value={userData.user.phone_number} />
                <InfoRow label="Hourly Rate" value={`₹${userData.user.hourly_rate}`} />
                <InfoRow label="User ID" value={userData.user.id} />
            </View>

            {/* Attendance Details */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    Attendance This Month ({userData.attendance_this_month?.length || 0} records)
                </Text>
                {userData.attendance_this_month?.map((attendance, index) => (
                    <View key={index} style={styles.attendanceItem}>
                        <Text style={styles.attendanceDate}>
                            {new Date(attendance.check_in).toLocaleDateString()}
                        </Text>
                        <Text style={styles.attendanceTime}>
                            In: {new Date(attendance.check_in).toLocaleTimeString()}
                            {attendance.check_out &&
                                ` | Out: ${new Date(attendance.check_out).toLocaleTimeString()}`
                            }
                        </Text>
                        <Text style={styles.hoursWorked}>
                            Hours: {attendance.hours_worked || 'Not completed'}
                        </Text>
                    </View>
                ))}
                {(!userData.attendance_this_month || userData.attendance_this_month.length === 0) && (
                    <Text style={styles.noDataText}>No attendance records for this month</Text>
                )}
            </View>

            {/* Bill Information */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Billing Information</Text>

                {userData.current_month_bill && (
                    <View style={styles.billCard}>
                        <Text style={styles.billTitle}>Current Month</Text>
                        <InfoRow label="Total Hours" value={userData.current_month_bill.total_hours} />
                        <InfoRow label="Total Amount" value={`₹${userData.current_month_bill.total_amount}`} />
                        <InfoRow label="Generated" value={
                            new Date(userData.current_month_bill.generated_at).toLocaleDateString()
                        } />
                    </View>
                )}

                {userData.last_month_bill && (
                    <View style={styles.billCard}>
                        <Text style={styles.billTitle}>Last Month</Text>
                        <InfoRow label="Total Hours" value={userData.last_month_bill.total_hours} />
                        <InfoRow label="Total Amount" value={`₹${userData.last_month_bill.total_amount}`} />
                        <InfoRow label="Generated" value={
                            new Date(userData.last_month_bill.generated_at).toLocaleDateString()
                        } />
                    </View>
                )}

                {!userData.current_month_bill && !userData.last_month_bill && (
                    <Text style={styles.noDataText}>No billing information available</Text>
                )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
                <TouchableOpacity
                    style={styles.refreshButton}
                    onPress={refreshData}
                    disabled={refreshing}
                >
                    <Text style={styles.refreshButtonText}>
                        {refreshing ? 'Refreshing...' : 'Refresh Data'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backButtonText}>Back to Home</Text>
                </TouchableOpacity>
            </View>

            {/* Auto-refresh Indicator */}
            <View style={styles.autoRefreshInfo}>
                <Text style={styles.autoRefreshText}>
                    Data auto-refreshes every 5 minutes
                </Text>
                <Text style={styles.currentTime}>
                    Current time: {currentTime.toLocaleTimeString()}
                </Text>
            </View>
        </ScrollView>
    );
};

const InfoRow = ({ label, value }) => (
    <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}:</Text>
        <Text style={styles.infoValue}>{value || 'N/A'}</Text>
    </View>
);

export default DashboardScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        backgroundColor: '#841584',
        padding: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 5,
    },
    lastUpdated: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
    },
    billDownloadSection: {
        backgroundColor: 'white',
        margin: 10,
        padding: 15,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    periodSelector: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 15,
    },
    pickerContainer: {
        flex: 1,
        marginHorizontal: 5,
    },
    pickerLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 5,
    },
    picker: {
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
    },
    downloadBillButton: {
        backgroundColor: '#4CAF50',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 15,
    },
    downloadButtonDisabled: {
        backgroundColor: '#cccccc',
    },
    downloadBillButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    billPreview: {
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 5,
    },
    billPreviewTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
    },
    billPreviewInfo: {
        // Styles for bill preview info
    },
    billPreviewText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 3,
    },
    statusCard: {
        backgroundColor: 'white',
        margin: 10,
        padding: 15,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statusTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#333',
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    statusLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#555',
    },
    statusValue: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    statusActive: {
        color: '#4CAF50',
    },
    statusInactive: {
        color: '#F44336',
    },
    liveSession: {
        backgroundColor: '#E8F5E8',
        padding: 10,
        borderRadius: 5,
        marginVertical: 10,
    },
    liveSessionText: {
        color: '#4CAF50',
        fontWeight: 'bold',
        fontSize: 14,
    },
    liveSessionHours: {
        color: '#333',
        fontSize: 12,
        marginTop: 2,
    },
    liveSessionEarnings: {
        color: '#841584',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        margin: 10,
        justifyContent: 'space-between',
    },
    statCard: {
        backgroundColor: 'white',
        width: '48%',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#841584',
        marginBottom: 5,
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
    },
    section: {
        backgroundColor: 'white',
        margin: 10,
        padding: 15,
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
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        paddingVertical: 5,
    },
    infoLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#555',
    },
    infoValue: {
        fontSize: 16,
        color: '#841584',
        fontWeight: '500',
    },
    attendanceItem: {
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
    },
    attendanceDate: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    attendanceTime: {
        fontSize: 12,
        color: '#666',
    },
    hoursWorked: {
        fontSize: 12,
        color: '#841584',
        fontWeight: '600',
    },
    billCard: {
        backgroundColor: '#f0f0f0',
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
    },
    billTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
    },
    noDataText: {
        textAlign: 'center',
        color: '#666',
        fontStyle: 'italic',
        marginVertical: 10,
    },
    actionButtons: {
        margin: 15,
    },
    refreshButton: {
        backgroundColor: '#2196F3',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 10,
    },
    refreshButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    backButton: {
        backgroundColor: '#841584',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
    },
    backButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    autoRefreshInfo: {
        alignItems: 'center',
        padding: 10,
        marginBottom: 20,
    },
    autoRefreshText: {
        fontSize: 12,
        color: '#666',
        marginBottom: 5,
    },
    currentTime: {
        fontSize: 12,
        color: '#999',
    },
});