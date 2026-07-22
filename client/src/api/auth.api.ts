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
    dingtalkUserId?: string | null;
    auth: {
      role: string;
      label: string;
      description?: string;
      permissions: string[];
      permissionDetails?: Array<{ permission: string; label: string }>;
      permissionCatalog?: Array<{ permission: string; label: string }>;
      roles?: Array<{ role: string; label: string; description?: string; permissions: string[] }>;
    };
  };
};

export function login(username: string, password: string) {
  return request.post<LoginResult>("/auth/login", { username, password });
}

export function getMe() {
  return request.get<{
    user: LoginResult["user"];
    role: string;
    label: string;
    description?: string;
    permissions: string[];
    permissionDetails?: Array<{ permission: string; label: string }>;
    permissionCatalog?: Array<{ permission: string; label: string }>;
    roles?: Array<{ role: string; label: string; description?: string; permissions: string[] }>;
  }>("/auth/me");
}

export type ManagedUser = LoginResult["user"];

export function changePassword(currentPassword: string, nextPassword: string) {
  return request.post<LoginResult>("/auth/change-password", { currentPassword, nextPassword });
}

export function getUsers() {
  return request.get<{ rows: ManagedUser[] }>("/auth/users");
}

export function createUser(payload: { username: string; password: string; displayName: string; role: string; dingtalkUserId?: string }) {
  return request.post<ManagedUser>("/auth/users", payload);
}

export type StaffAccountSummary = Pick<ManagedUser, "id" | "username" | "displayName" | "role" | "isActive" | "mustChangePassword">;

export type StaffAccountSyncResult = {
  month: string;
  importBatchNo: string;
  sourceFileName: string;
  created: Array<StaffAccountSummary & { initialPassword: string }>;
  existing: StaffAccountSummary[];
  mergedAccounts?: Array<{
    account: StaffAccountSummary;
    previousRole: string;
    disabledDuplicateAccounts: string[];
  }>;
  disabledDuplicateAccounts?: string[];
  disabledPlaceholderAccounts: string[];
};

export function syncStaffUsers(month: string) {
  return request.post<StaffAccountSyncResult>("/auth/users/sync-staff", { month });
}

export function updateUser(id: number, payload: { displayName?: string; role?: string; isActive?: boolean; resetPassword?: string; dingtalkUserId?: string | null }) {
  return request.patch<ManagedUser>(`/auth/users/${id}`, payload);
}

export function getNotificationStatus() {
  return request.get<{ provider: string | null; configured: boolean; channels: { dingtalkDirect: { configured: boolean; appKeyConfigured: boolean; appSecretConfigured: boolean; robotCodeConfigured: boolean }; dingtalkWebhook: { configured: boolean; signingEnabled: boolean }; wecomWebhook: { configured: boolean } } }>("/auth/notification-status");
}
