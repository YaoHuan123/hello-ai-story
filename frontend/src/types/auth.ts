export type SmsScene = "login" | "change_phone_old" | "change_phone_new" | "delete_account";

export interface AuthResult {
  token: string;
  userId: string;
  phone: string;
  dataDir: string;
}

export interface MeResponse {
  userId: string;
  phone: string;
  dataDir: string;
  createdAt: string;
  role: string;
}
