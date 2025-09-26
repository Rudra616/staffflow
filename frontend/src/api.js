import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from './navigation/RootNavigation';

import { BASE_URL } from '@env';

const api = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

let refreshTimer = null;

// === AUTOMATIC TOKEN REFRESH SCHEDULER ===
const scheduleTokenRefresh = async () => {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }

    const accessToken = await AsyncStorage.getItem("access");
    if (!accessToken) return;

    try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const exp = payload.exp * 1000; // Token expiration time
        const now = Date.now();
        const expiresIn = exp - now;

        // Dynamic calculation based on actual token expiry
        // Refresh when 25% of token life remains (or 30 seconds minimum)
        const refreshTime = Math.max(expiresIn * 0.50, 30000);

        if (refreshTime > 0) {
            refreshTimer = setTimeout(() => {
                refreshTokenSilently();
            }, refreshTime);
        }
    } catch (error) {
        // Silent error - will handle on next API call
    }
};

// === SILENT TOKEN REFRESH ===
const refreshTokenSilently = async () => {
    try {
        const refresh = await AsyncStorage.getItem("refresh");
        if (!refresh) return;

        const response = await api.post('token/refresh/', { refresh });
        const newAccess = response.data.access;
        await AsyncStorage.setItem("access", newAccess);

        // Reschedule with new token's expiry time
        scheduleTokenRefresh();
    } catch (error) {
        // Silent error - will handle on next API call
    }
};

// === LOGIN FUNCTION ===
export const loginUser = async (username, password) => {
    try {
        const response = await api.post('token/', { username, password });

        await AsyncStorage.setItem("access", response.data.access);
        await AsyncStorage.setItem("refresh", response.data.refresh);

        // Schedule refresh based on the token we just received
        scheduleTokenRefresh();
        return response.data;
    } catch (error) {
        throw new Error(error.response?.data?.detail || "server was down");
    }
};

// === LOGOUT FUNCTION ===
const logoutUser = async () => {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    await AsyncStorage.multiRemove(["access", "refresh"]);
};

// === REQUEST INTERCEPTOR ===
api.interceptors.request.use(async (config) => {
    if (config.url.endsWith('token/') || config.url.endsWith('token/refresh/')) {
        return config;
    }

    const access = await AsyncStorage.getItem("access");
    if (access) {
        config.headers.Authorization = `Bearer ${access}`;
    } else {
        if (navigationRef.isReady()) {
            navigationRef.reset({ index: 0, routes: [{ name: "Login" }] });
        }
        return Promise.reject({ message: 'No access token' });
    }

    return config;
}, error => Promise.reject(error));

// === RESPONSE INTERCEPTOR ===
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refresh = await AsyncStorage.getItem("refresh");
                if (refresh) {
                    const res = await api.post('token/refresh/', { refresh });
                    const newAccess = res.data.access;
                    await AsyncStorage.setItem("access", newAccess);
                    scheduleTokenRefresh();
                    originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                    return api(originalRequest);
                }
            } catch (refreshError) {
                await logoutUser();
                if (navigationRef.isReady()) {
                    navigationRef.reset({ index: 0, routes: [{ name: "Login" }] });
                }
            }
        }

        return Promise.reject(error);
    }
);

// api.js - Add a function to check user role

export const getUserRole = async () => {
    try {
        const response = await api.get('dashboard/');
        return {
            isAdmin: response.data.user?.is_admin || false,
            userData: response.data
        };
    } catch (error) {
        throw new Error('Failed to get user role');
    }
};


export default api;
export { logoutUser };