export interface Role {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  type: 'Default' | 'Custom';
  created_at?: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description?: string;
}

export interface RolePermission {
  id?: string;
  role_id: string;
  permission_id: string;
}

export interface UserRow {
  id: string;
  name: string;
  email?: string;
  username?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'suspended';
  role_id?: string;
  department_id?: string;
  cost_center_id?: string;
  deleted_at?: string | null;
  created_at?: string;
  roles?: Role | null;
  departments?: { id: string; name: string } | null;
  cost_centers?: { id: string; name: string } | null;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action_type: string;
  target_object: string;
  target_id?: string | null;
  changes?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
  profiles?: { name: string } | null;
}

export interface LoginHistory {
  id: string;
  user_id: string;
  login_time: string;
  logout_time?: string | null;
  status: 'Active' | 'Logged Out' | 'Session Expired';
  created_at: string;
  profiles?: { name: string } | null;
}

export interface DataAccessPolicy {
  id: string;
  name: string;
  role_id?: string;
  department_id?: string;
  access_level: string;
  max_amount?: number;
  status: string;
  roles?: { name: string } | null;
  departments?: { name: string } | null;
}
