export type LoginMethod = "phone" | "apple";

export type SmsScene = "login" | "change_phone_old" | "change_phone_new" | "delete_account";

export interface AuthResult {
  token: string;
  userId: string;
  dataDir: string;
  loginMethod: LoginMethod;
  phone?: string;
  appleEmail?: string;
}

export interface MeResponse {
  userId: string;
  loginMethod: LoginMethod;
  phone?: string;
  appleEmail?: string;
  dataDir: string;
  createdAt: string;
  role: string;
}
