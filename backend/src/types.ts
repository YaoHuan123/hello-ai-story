export type LoginMethod = "phone" | "apple";

export interface UserRecord {
  id: string;
  phone: string | null;
  apple_sub: string | null;
  login_method: LoginMethod;
  apple_email: string | null;
  data_dir: string;
  created_at: string;
  role?: string;
  preferred_material_id?: string | null;
  token_version: number;
}

export interface JwtPayload {
  userId: string;
  tv: number;
  loginMethod: LoginMethod;
  phone?: string;
}

export interface AuthSuccessResponse {
  token: string;
  userId: string;
  dataDir: string;
  loginMethod: LoginMethod;
  phone?: string;
  appleEmail?: string;
}

export interface ErrorResponse {
  code: string;
  message: string;
}
