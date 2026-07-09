import { request } from "./request";

export type LoginResult = {
  token: string;
  expiresAt: string;
  user: {
    id: number;
    username: string;
    displayName: string;
    role: string;
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
