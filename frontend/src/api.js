// api.js - UPDATED
import axios from 'axios';
import { navigationRef } from './navigation/RootNavigation';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use a fallback if environment variable is not available
const BASE_URL = 'https://staffflow.onrender.com/api/';

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
});

let refreshTimer = null;

// Clear tokens and redirect to login
export const clearTokensAndRelogin = async () => {
    console.log('Clearing tokens and redirecting to login...');
    await AsyncStorage.multiRemove(["access", "refresh"]);
    if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: "Login" }] });
    }
};

// Schedule token refresh
const scheduleTokenRefresh = async () => {
    if (refreshTimer) clearTimeout(refreshTimer);

    const accessToken = await AsyncStorage.getItem("access");
    if (!accessToken) return;

    try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const exp = payload.exp * 1000;
        const now = Date.now();
        const expiresIn = exp - now;
        const refreshTime = Math.max(expiresIn * 0.50, 30000);

        if (refreshTime > 0) {
            refreshTimer = setTimeout(refreshTokenSilently, refreshTime);
        }
    } catch (error) {
        console.log('Token schedule error:', error);
    }
};

// Silent token refresh
const refreshTokenSilently = async () => {
    try {
        const refresh = await AsyncStorage.getItem("refresh");
        if (!refresh) return;

        const response = await api.post('token/refresh/', { refresh });
        await AsyncStorage.setItem("access", response.data.access);
        scheduleTokenRefresh();
    } catch (error) {
        await clearTokensAndRelogin();
    }
};

// Login function
export const loginUser = async (username, password) => {
    try {
        const response = await api.post('token/', { username, password });

        await AsyncStorage.setItem("access", response.data.access);
        await AsyncStorage.setItem("refresh", response.data.refresh);
        scheduleTokenRefresh();

        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.detail || "Login failed");
    }
};

// Logout function
export const logoutUser = async () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    await clearTokensAndRelogin();
};

// Request interceptor - IMPROVED
api.interceptors.request.use(async (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);

    // Skip auth for token endpoints
    if (config.url.endsWith('token/') || config.url.endsWith('token/refresh/')) {
        return config;
    }

    const access = await AsyncStorage.getItem("access");
    console.log('Access token available:', !!access);

    if (access) {
        config.headers.Authorization = `Bearer ${access}`;
        console.log('Authorization header set');
    } else {
        console.log('No access token available');
    }

    return config;
}, error => {
    console.log('Request interceptor error:', error);
    return Promise.reject(error);
});

// Response interceptor - IMPROVED
api.interceptors.response.use(
    (response) => {
        console.log(`API Response: ${response.status} ${response.config.url}`);
        return response;
    },
    async (error) => {
        console.log(`API Error: ${error.response?.status} ${error.config?.url}`);
        console.log('Error details:', error.response?.data);

        const originalRequest = error.config;

        if (error.response?.status === 401) {
            console.log('401 Unauthorized error detected');

            if (originalRequest && !originalRequest._retry) {
                originalRequest._retry = true;
                console.log('Attempting token refresh...');

                try {
                    const refresh = await AsyncStorage.getItem("refresh");
                    if (refresh) {
                        const res = await api.post('token/refresh/', { refresh });
                        await AsyncStorage.setItem("access", res.data.access);
                        scheduleTokenRefresh();
                        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
                        console.log('Token refreshed, retrying original request');
                        return api(originalRequest);
                    } else {
                        console.log('No refresh token available');
                        await clearTokensAndRelogin();
                    }
                } catch (refreshError) {
                    console.log('Token refresh failed:', refreshError);
                    await clearTokensAndRelogin();
                }
            } else {
                console.log('Request already retried or no original request');
                await clearTokensAndRelogin();
            }
        }

        return Promise.reject(error);
    }
);

export const getUserRole = async () => {
    try {
        console.log('Fetching user role from dashboard endpoint...');
        const response = await api.get('dashboard/');
        return {
            isAdmin: response.data.user?.is_admin || false,
            userData: response.data
        };
    } catch (error) {
        console.log('Error fetching user role:', error);
        throw error;
    }
};

export default api;