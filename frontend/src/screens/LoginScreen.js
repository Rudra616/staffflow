// LoginScreen.js - UPDATED
import React, { useState } from 'react';
import {
    View,
    TextInput,
    Button,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { loginUser } from '../api'; // Import from your API module
import Icon from 'react-native-vector-icons/Feather'; // Make sure this is installed

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigation = useNavigation();

    // Handle password input change manually to mask with '*'
    const handlePasswordChange = (text) => {
        if (text.length > password.length) {
            // Add new character
            const newChar = text[text.length - 1];
            setPassword(password + newChar);
        } else {
            // Remove last character
            setPassword(password.slice(0, -1));
        }
    };

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert('Error', 'Please enter both username and password.');
            return;
        }

        setIsLoading(true);

        try {
            console.log('LoginScreen: Attempting login...');

            // Use your API module's loginUser function
            const tokens = await loginUser(username, password);
            console.log('Login Successful, Tokens Received');

            // Navigate to Home screen
            navigation.navigate('Home');
        } catch (error) {
            console.error('Login Error:', error);
            Alert.alert('Login Failed', error.message || 'Invalid credentials');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>StaffFlow Login</Text>

            <View style={styles.card}>
                <TextInput
                    placeholder="Username"
                    value={username}
                    onChangeText={setUsername}
                    style={styles.input}
                    autoCapitalize="none"
                    editable={!isLoading}
                />

                <View style={{ position: 'relative' }}>
                    <TextInput
                        placeholder="Password"
                        value={showPassword ? password : '*'.repeat(password.length)}
                        onChangeText={handlePasswordChange}
                        style={styles.input}
                        autoCapitalize="none"
                        editable={!isLoading}
                    />

                    <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.iconContainer}
                        disabled={isLoading}
                    >
                        <Icon
                            name={showPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color="#999"
                        />
                    </TouchableOpacity>
                </View>

                <Button
                    title={isLoading ? 'Logging In...' : 'Log In'}
                    onPress={handleLogin}
                    disabled={isLoading}
                    color="#1e90ff"
                />
                {isLoading && (
                    <View style={styles.activityIndicatorContainer}>
                        <ActivityIndicator size="small" color="#1e90ff" />
                    </View>
                )}
            </View>

            <Text style={styles.baseUrlText}>
                API Base: https://staffflow.onrender.com/api/
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 20,
    },
    title: {
        fontSize: 34,
        fontWeight: '700',
        color: '#333',
        marginBottom: 35,
        letterSpacing: 0.5,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#fff',
        borderRadius: 15,
        padding: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 10,
    },
    input: {
        height: 50,
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 15,
        marginBottom: 15,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
        shadowColor: '#1e90ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
    },
    iconContainer: {
        position: 'absolute',
        right: 15,
        top: 15,
    },
    activityIndicatorContainer: {
        marginTop: 15,
        alignItems: 'center',
    },
    baseUrlText: {
        marginTop: 30,
        fontSize: 12,
        color: '#999',
    },
});
