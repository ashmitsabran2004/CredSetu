import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';

const TOKEN_KEY = 'miniledger-jwt';
export type Loan = {
  id: number; friend_name: string; amount: string; due_date: string;
  repaid_at: string | null; receipt_url: string | null; created_at: string; is_overdue: boolean;
};
export type Summary = { total_lent: string; total_repaid: string; overdue_amount: string };

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  let data: any;
  try {
    response = await fetch(url, { ...options, headers, signal: controller.signal });
    data = await response.json();
  } catch (error) {
    const reason = controller.signal.aborted ? 'The request timed out after 15 seconds.' : 'Check that the backend is running and reachable from this device.';
    const detail = error instanceof Error ? ` (${error.message})` : '';
    throw new Error(`Unable to reach ${url}. ${reason}${detail}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(data?.error?.message || 'Request failed');
  return data as T;
}

export const apiClient = {
  requestOtp: (phone: string) => api<{ message: string }>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) => api<{ token: string }>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  saveToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  removeToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  loans: (token: string) => api<Loan[]>('/loans', {}, token),
  summary: (token: string) => api<Summary>('/summary', {}, token),
  addLoan: (token: string, values: { friend_name: string; amount: string; due_date: string; photoUri?: string }) => {
    const body = new FormData();
    body.append('friend_name', values.friend_name); body.append('amount', values.amount); body.append('due_date', values.due_date);
    if (values.photoUri) body.append('receipt', { uri: values.photoUri, name: 'receipt.jpg', type: 'image/jpeg' } as unknown as Blob);
    return api<Loan>('/loans', { method: 'POST', body }, token);
  },
  repay: (token: string, id: number) => api<Loan>(`/loans/${id}/repay`, { method: 'PATCH' }, token),
};
