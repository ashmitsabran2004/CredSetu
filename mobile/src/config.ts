// For a physical phone, find the laptop's Wi-Fi IP with `ip -4 -o addr show scope global`.
// Set EXPO_PUBLIC_API_URL to http://<laptop-ip>:3000 before starting Expo.
// This placeholder is intentionally not a working network address.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://YOUR-LAPTOP-IP:3000';
