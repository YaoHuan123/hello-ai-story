export interface UserRecord {
  id: string;
  phone: string;
  data_dir: string;
  created_at: string;
  role?: string;
  preferred_material_id?: string | null;
  token_version: number;
}

export interface JwtPayload {
  userId: string;
  phone: string;
  tv: number;
}

export interface AuthSuccessResponse {
  token: string;
  userId: string;
  phone: string;
  dataDir: string;
}

export interface ErrorResponse {
  code: string;
  message: string;
}
