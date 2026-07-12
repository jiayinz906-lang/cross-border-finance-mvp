import { request } from "./request";

export type LoginResult = {
  token: string;
  expiresAt: string;
  user: {
    id: number;
    username: string;
    displayName: string;
    role: string;
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt?: string | null;
    passwordChangedAt?: string | null;
    auth: {
      role: string;
      label: string;
      permissions: string[];
    };
  };
};

export function login(username: string, password: string) {
  return request.post<LoginResult>("/auth/login", { username, password });
}

export function getMe() {
  return request.get("/auth/me");
}

export type ManagedUser = LoginResult["user"];

export function changePassword(currentPassword: string, nextPassword: string) {
  return request.post<LoginResult>("/auth/change-password", { currentPassword, nextPassword });
}

export function getUsers() {
  return request.get<{ rows: ManagedUser[] }>("/auth/users");
}

export function createUser(payload: { username: string; password: string; displayName: string; role: string }) {
  return request.post<ManagedUser>("/auth/users", payload);
}

export function updateUser(id: number, payload: { displayName?: string; role?: string; isActive?: boolean; resetPassword?: string }) {
  return request.patch<ManagedUser>(`/auth/users/${id}`, payload);
}

export function getNotificationStatus() {
  return request.get<{ provider: string; configured: boolean }>("/auth/notification-status");
}
