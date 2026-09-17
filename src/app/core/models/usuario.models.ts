export type RolUsuario = 'ADMIN' | 'USUARIO';

export interface Usuario {
  id: string;
  usuario: string; // Nombre de usuario para login (ej: Jeremy)
  nombre: string;  // Nombre visible
  email?: string;
  password: string; // Clave de acceso
  rol: RolUsuario;  // 'ADMIN' (acceso total) o 'USUARIO' (operativo sin gestión de usuarios)
  activo: boolean;
  ultimo_acceso?: string;
  created_at: string;
}

export interface CredencialesLogin {
  usuario: string;
  password: string;
}

export interface NuevoUsuarioDTO {
  usuario: string;
  nombre: string;
  password: string;
  rol: RolUsuario;
  email?: string;
}

export interface RegistroUsuarioDTO {
  usuario: string;
  nombre: string;
  password: string;
  email?: string;
}
