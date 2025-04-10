/**
 *  School model
 */
export interface School {
  id: number;
  name: string;
}

/**
 *  Role model
 */
export interface Role {
  id: number;
  description: string;
}

/**
 *  User model
 */
export interface User {
  id: string;
  username: string;
  email: string | null;
  nameFirst: string | null;
  nameMiddle: string | null;
  nameLast: string | null;
  avatarUrl: string | null;
  schoolId: number | null;
  roleId: number;
  password: string | null;
  deactivated: boolean;
}
