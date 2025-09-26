import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { writeAsStringAsync, documentDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import api from '../api';

const AdminScreen = ({ navigation }) => {
    const [adminData, setAdminData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const fetchAdminData = async () => {
        try {
            setLoading(true);
            const response = await api.get(`admin/dashboard/?month=${selectedMonth}&year=${selectedYear}`);
            setAdminData(response.data);
        } catch (error) {
            console.log('Error fetching admin data:', error);
            Alert.alert('Error', 'Failed to load admin data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchAdminData();
    };

    // Generate PDF for individual user bill
    const generateUserBillPDF = async (user) => {
        try {
            const userBill = getUserBillInfo(user.id);

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
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Monthly Bill Statement</h1>
                        <h2>${monthNames[selectedMonth - 1]} ${selectedYear}</h2>
                    </div>
                    
                    <div class="company-info">
                        <h3>Company Information</h3>
                        <p><strong>Company:</strong> Your Company Name</p>
                        <p><strong>Address:</strong> Company Address Here</p>
                        <p><strong>Contact:</strong> contact@company.com | +91-XXXXXXXXXX</p>
                    </div>
                    
                    <div class="user-info">
                        <h3>Employee Information</h3>
                        <p><strong>Name:</strong> ${user.full_name || user.username}</p>
                        <p><strong>Username:</strong> ${user.username}</p>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Phone:</strong> ${user.phone_number || 'N/A'}</p>
                        <p><strong>Hourly Rate:</strong> ₹${parseFloat(user.hourly_rate || 0).toFixed(2)}</p>
                    </div>
                    
                    <div class="bill-info">
                        <h3>Bill Details</h3>
                        <table class="table">
                            <tr>
                                <th>Description</th>
                                <th>Amount</th>
                            </tr>
                            <tr>
                                <td>Total Hours Worked</td>
                                <td>${userBill?.total_hours || 0} hours</td>
                            </tr>
                            <tr>
                                <td>Hourly Rate</td>
                                <td>₹${parseFloat(user.hourly_rate || 0).toFixed(2)}/hour</td>
                            </tr>
                            <tr>
                                <td><strong>Total Amount</strong></td>
                                <td><strong>₹${parseFloat(userBill?.total_amount || 0).toFixed(2)}</strong></td>
                            </tr>
                        </table>
                    </div>
                    
                    <div class="footer">
                        <p>Generated on: ${new Date().toLocaleDateString()}</p>
                        <p>This is a computer-generated bill. No signature required.</p>
                    </div>
                </body>
                </html>
            `;

            const { uri } = await Print.printToFileAsync({ html: htmlContent });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: `Bill - ${user.username} - ${monthNames[selectedMonth - 1]} ${selectedYear}`
                });
            } else {
                Alert.alert('Success', `PDF bill generated for ${user.username}`);
            }
        } catch (error) {
            console.log('PDF generation error:', error);
            Alert.alert('Error', 'Failed to generate PDF bill');
        }
    };

    // Download individual user bill (CSV)
    const downloadUserBill = async (user) => {
        try {
            Alert.alert(
                `Download Bill for ${user.username}`,
                `Choose format for ${user.full_name}'s bill:`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Download PDF',
                        onPress: () => generateUserBillPDF(user)
                    },
                    {
                        text: 'Download CSV',
                        onPress: async () => {
                            try {
                                const response = await api.get(
                                    `admin/bills/download/?month=${selectedMonth}&year=${selectedYear}&user_id=${user.id}`,
                                    { responseType: 'blob' }
                                );

                                const reader = new FileReader();
                                reader.readAsText(response.data);

                                reader.onloadend = async () => {
                                    try {
                                        const csvString = reader.result;
                                        const fileUri = documentDirectory + `${user.username}_bill_${selectedMonth}_${selectedYear}.csv`;

                                        await writeAsStringAsync(fileUri, csvString, {
                                            encoding: 'utf8'
                                        });

                                        if (await Sharing.isAvailableAsync()) {
                                            await Sharing.shareAsync(fileUri, {
                                                mimeType: 'text/csv',
                                                dialogTitle: `Download Bill - ${user.username}`
                                            });
                                        } else {
                                            Alert.alert('Success', `Bill downloaded for ${user.username}`);
                                        }
                                    } catch (error) {
                                        Alert.alert('Error', 'Failed to save the file');
                                    }
                                };
                            } catch (error) {
                                Alert.alert('Error', `Failed to download bill for ${user.username}`);
                            }
                        }
                    }
                ]
            );
        } catch (error) {
            console.log('Download error:', error);
        }
    };

    // Download all users bills with improved CSV format
    const downloadAllBills = async () => {
        try {
            Alert.alert(
                "Download All Bills",
                "Choose format for all bills:",
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Download PDF',
                        onPress: generateAllBillsPDF
                    },
                    {
                        text: 'Download CSV',
                        onPress: downloadAllBillsCSV
                    }
                ]
            );
        } catch (error) {
            console.log('Download all bills error:', error);
        }
    };

    const downloadAllBillsCSV = async () => {
        try {
            const response = await api.get(
                `admin/bills/download/?month=${selectedMonth}&year=${selectedYear}`,
                { responseType: 'blob' }
            );

            const reader = new FileReader();
            reader.readAsText(response.data);

            reader.onloadend = async () => {
                try {
                    const csvString = reader.result;
                    const fileUri = documentDirectory + `all_bills_${monthNames[selectedMonth - 1]}_${selectedYear}.csv`;

                    await writeAsStringAsync(fileUri, csvString, {
                        encoding: 'utf8'
                    });

                    if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(fileUri, {
                            mimeType: 'text/csv',
                            dialogTitle: 'Download All Bills'
                        });
                    } else {
                        Alert.alert('Success', 'All bills downloaded successfully');
                    }
                } catch (error) {
                    Alert.alert('Error', 'Failed to save the file');
                }
            };
        } catch (error) {
            Alert.alert('Error', 'Failed to download all bills');
        }
    };

    const generateAllBillsPDF = async () => {
        try {
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                        .summary { background-color: #f9f9f9; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
                        .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        .table th, .table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                        .table th { background-color: #841584; color: white; }
                        .total-row { font-weight: bold; background-color: #f2f2f2; }
                        .footer { margin-top: 30px; text-align: center; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>All Bills Summary</h1>
                        <h2>${monthNames[selectedMonth - 1]} ${selectedYear}</h2>
                    </div>
                    
                    <div class="summary">
                        <h3>Monthly Summary</h3>
                        <p><strong>Total Users:</strong> ${adminData?.total_users || 0}</p>
                        <p><strong>Total Attendance Records:</strong> ${adminData?.total_attendance_records || 0}</p>
                        <p><strong>Total Hours:</strong> ${adminData?.total_hours || 0}</p>
                        <p><strong>Total Amount:</strong> ₹${parseFloat(adminData?.total_amount || 0).toFixed(2)}</p>
                    </div>
                    
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Employee Name</th>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Hourly Rate</th>
                                <th>Total Hours</th>
                                <th>Total Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${adminData?.users?.map(user => {
                const userBill = getUserBillInfo(user.id);
                return `
                                    <tr>
                                        <td>${user.full_name || user.username}</td>
                                        <td>${user.username}</td>
                                        <td>${user.email}</td>
                                        <td>₹${parseFloat(user.hourly_rate || 0).toFixed(2)}</td>
                                        <td>${userBill?.total_hours || 0}</td>
                                        <td>₹${parseFloat(userBill?.total_amount || 0).toFixed(2)}</td>
                                        <td>${userBill ? 'Active' : 'No Data'}</td>
                                    </tr>
                                `;
            }).join('')}
                            <tr class="total-row">
                                <td colspan="4"><strong>TOTAL</strong></td>
                                <td><strong>${adminData?.total_hours || 0}</strong></td>
                                <td><strong>₹${parseFloat(adminData?.total_amount || 0).toFixed(2)}</strong></td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div class="footer">
                        <p>Generated on: ${new Date().toLocaleDateString()}</p>
                        <p>Total Records: ${adminData?.users?.length || 0}</p>
                    </div>
                </body>
                </html>
            `;

            const { uri } = await Print.printToFileAsync({ html: htmlContent });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: `All Bills - ${monthNames[selectedMonth - 1]} ${selectedYear}`
                });
            } else {
                Alert.alert('Success', 'All bills PDF generated successfully');
            }
        } catch (error) {
            console.log('PDF generation error:', error);
            Alert.alert('Error', 'Failed to generate PDF for all bills');
        }
    };

    // Download users information with improved format
    const downloadUsersInfo = async () => {
        try {
            // Create comprehensive CSV content
            let csvContent = 'Username,Full Name,Email,Phone,Hourly Rate,Total Hours,Total Amount,Status,Month,Year\n';

            adminData.users.forEach(user => {
                const userBill = adminData.bills?.find(bill => bill.user === user.id);
                csvContent += `"${user.username}","${user.full_name || ''}","${user.email}","${user.phone_number || ''}",${user.hourly_rate},${userBill?.total_hours || 0},${userBill?.total_amount || 0},"${userBill ? 'Active' : 'No Data'}","${monthNames[selectedMonth - 1]}","${selectedYear}"\n`;
            });

            const fileUri = documentDirectory + `users_info_${monthNames[selectedMonth - 1]}_${selectedYear}.csv`;

            await writeAsStringAsync(fileUri, csvContent, {
                encoding: 'utf8'
            });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: 'Download Users Information'
                });
            } else {
                Alert.alert('Success', 'Users information downloaded successfully');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to download users information');
        }
    };

    // Get user's bill information
    const getUserBillInfo = (userId) => {
        if (!adminData?.bills) return null;
        return adminData.bills.find(bill => bill.user === userId);
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `₹${parseFloat(amount || 0).toFixed(2)}`;
    };

    useEffect(() => {
        fetchAdminData();
    }, [selectedMonth, selectedYear]);

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#841584" />
                <Text style={styles.loadingText}>Loading Admin Dashboard...</Text>
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
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>📊 Admin Dashboard</Text>
                <Text style={styles.subtitle}>
                    {monthNames[selectedMonth - 1]} {selectedYear} • {adminData?.users?.length || 0} Users
                </Text>
            </View>

            {/* Month/Year Selector */}
            <View style={styles.selectorSection}>
                <Text style={styles.sectionTitle}>📅 Select Period</Text>
                <View style={styles.selectorRow}>
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
            </View>

            {/* Statistics Cards */}
            <View style={styles.statsSection}>
                <Text style={styles.sectionTitle}>📈 Monthly Overview</Text>
                <View style={styles.statsGrid}>
                    <View style={[styles.statCard, styles.totalUsersCard]}>
                        <Text style={styles.statIcon}>👥</Text>
                        <Text style={styles.statNumber}>{adminData?.total_users || 0}</Text>
                        <Text style={styles.statLabel}>Total Users</Text>
                    </View>

                    <View style={[styles.statCard, styles.attendanceCard]}>
                        <Text style={styles.statIcon}>📝</Text>
                        <Text style={styles.statNumber}>{adminData?.total_attendance_records || 0}</Text>
                        <Text style={styles.statLabel}>Attendance</Text>
                    </View>

                    <View style={[styles.statCard, styles.hoursCard]}>
                        <Text style={styles.statIcon}>⏱️</Text>
                        <Text style={styles.statNumber}>{adminData?.total_hours || 0}</Text>
                        <Text style={styles.statLabel}>Total Hours</Text>
                    </View>

                    <View style={[styles.statCard, styles.amountCard]}>
                        <Text style={styles.statIcon}>💰</Text>
                        <Text style={styles.statNumber}>{formatCurrency(adminData?.total_amount)}</Text>
                        <Text style={styles.statLabel}>Total Amount</Text>
                    </View>
                </View>
            </View>

            {/* Download Buttons */}
            <View style={styles.downloadSection}>
                <Text style={styles.sectionTitle}>📥 Download Reports</Text>
                <View style={styles.downloadButtons}>
                    <TouchableOpacity style={[styles.downloadButton, styles.allBillsButton]} onPress={downloadAllBills}>
                        <Text style={styles.downloadButtonIcon}>📋</Text>
                        <Text style={styles.downloadButtonText}>All Bills</Text>
                        <Text style={styles.downloadButtonSubtext}>PDF & CSV</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.downloadButton, styles.usersInfoButton]} onPress={downloadUsersInfo}>
                        <Text style={styles.downloadButtonIcon}>👤</Text>
                        <Text style={styles.downloadButtonText}>Users Info</Text>
                        <Text style={styles.downloadButtonSubtext}>Details CSV</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Users List with Detailed Information */}
            <View style={styles.usersSection}>
                <Text style={styles.sectionTitle}>
                    👥 All Users ({adminData?.users?.length || 0})
                </Text>

                {adminData?.users?.map((user) => {
                    const userBill = getUserBillInfo(user.id);
                    return (
                        <View key={user.id} style={styles.userCard}>
                            <View style={styles.userHeader}>
                                <View style={styles.userBasicInfo}>
                                    <Text style={styles.userName}>{user.full_name || user.username}</Text>
                                    <Text style={styles.userUsername}>@{user.username}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.downloadUserButton}
                                    onPress={() => downloadUserBill(user)}
                                >
                                    <Text style={styles.downloadUserButtonText}>📥 Download</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.userDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Email:</Text>
                                    <Text style={styles.detailValue}>{user.email}</Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Phone:</Text>
                                    <Text style={styles.detailValue}>{user.phone_number || 'N/A'}</Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Hourly Rate:</Text>
                                    <Text style={styles.detailValue}>{formatCurrency(user.hourly_rate)}/hr</Text>
                                </View>
                            </View>

                            <View style={styles.billInfo}>
                                <View style={styles.billItem}>
                                    <Text style={styles.billLabel}>Total Hours:</Text>
                                    <Text style={styles.billValue}>{userBill?.total_hours || 0} hrs</Text>
                                </View>

                                <View style={styles.billItem}>
                                    <Text style={styles.billLabel}>Total Amount:</Text>
                                    <Text style={[styles.billValue, styles.amountHighlight]}>
                                        {formatCurrency(userBill?.total_amount)}
                                    </Text>
                                </View>

                                <View style={styles.billItem}>
                                    <Text style={styles.billLabel}>Status:</Text>
                                    <Text style={[styles.billValue, userBill ? styles.statusActive : styles.statusInactive]}>
                                        {userBill ? 'Active' : 'No Data'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
};

// ... Keep the same styles as before, just add the new statusInactive style:
// const styles = StyleSheet.create({
//     // ... all your existing styles ...

//     // ... rest of your styles ...
// });

const styles = StyleSheet.create({
    statusInactive: {
        color: '#ff6b6b',
        fontWeight: 'bold',
    },
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        backgroundColor: '#841584',
        padding: 25,
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 14,
        color: 'white',
        opacity: 0.9,
    },
    selectorSection: {
        backgroundColor: 'white',
        margin: 15,
        padding: 20,
        borderRadius: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    selectorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
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
    statsSection: {
        backgroundColor: 'white',
        margin: 15,
        padding: 20,
        borderRadius: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    statCard: {
        width: '48%',
        alignItems: 'center',
        padding: 15,
        marginVertical: 5,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    totalUsersCard: { backgroundColor: '#e3f2fd' },
    attendanceCard: { backgroundColor: '#f3e5f5' },
    hoursCard: { backgroundColor: '#e8f5e8' },
    amountCard: { backgroundColor: '#fff3e0' },
    statIcon: {
        fontSize: 24,
        marginBottom: 5,
    },
    statNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
        textAlign: 'center',
    },
    downloadSection: {
        backgroundColor: 'white',
        margin: 15,
        padding: 20,
        borderRadius: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    downloadButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    downloadButton: {
        flex: 1,
        alignItems: 'center',
        padding: 15,
        marginHorizontal: 5,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    allBillsButton: { backgroundColor: '#4caf50' },
    usersInfoButton: { backgroundColor: '#2196f3' },
    downloadButtonIcon: {
        fontSize: 20,
        color: 'white',
        marginBottom: 5,
    },
    downloadButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    downloadButtonSubtext: {
        color: 'white',
        fontSize: 10,
        opacity: 0.9,
    },
    usersSection: {
        backgroundColor: 'white',
        margin: 15,
        padding: 20,
        borderRadius: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    userCard: {
        backgroundColor: '#f8f9fa',
        padding: 15,
        marginVertical: 8,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#841584',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    userHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    userBasicInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    userUsername: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    downloadUserButton: {
        backgroundColor: '#841584',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    downloadUserButtonText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    userDetails: {
        marginBottom: 10,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    detailLabel: {
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
    },
    detailValue: {
        fontSize: 12,
        color: '#333',
    },
    billInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    billItem: {
        alignItems: 'center',
    },
    billLabel: {
        fontSize: 10,
        color: '#666',
        marginBottom: 2,
    },
    billValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
    },
    amountHighlight: {
        color: '#4caf50',
        fontWeight: 'bold',
    },
    statusActive: {
        color: '#4caf50',
        fontWeight: 'bold',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#333',
    },
    loadingText: {
        marginTop: 20,
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
});

export default AdminScreen;