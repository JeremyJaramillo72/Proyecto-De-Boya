import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Usuario, NuevoUsuarioDTO, RegistroUsuarioDTO, RolUsuario } from '../models/usuario.models';

const STORAGE_KEYS = {
  USUARIOS: 'boya_usuarios',
  SESION: 'boya_sesion_activa'
};

const ADMIN_POR_DEFECTO: Usuario = {
  id: 'usr_admin_jeremy',
  usuario: 'Jeremy',
  nombre: 'Jeremy',
  password: '1939',
  rol: 'ADMIN',
  activo: true,
  created_at: new Date().toISOString().split('T')[0]
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private router = inject(Router);

  // Lista de usuarios registrados en el sistema
  public usuarios = signal<Usuario[]>([]);

  // Usuario que tiene la sesión iniciada actualmente
  public usuarioActual = signal<Usuario | null>(null);

  // Estado reactivo computado
  public estaAutenticado = computed(() => !!this.usuarioActual());
  public esAdmin = computed(() => this.usuarioActual()?.rol === 'ADMIN');
  public esUsuario = computed(() => this.usuarioActual()?.rol === 'USUARIO');

  /**
   * Determina si un objeto trabajador (o detalle de faena) corresponde al usuario actualmente en sesión
   */
  public esMiTrabajador(t: { id?: string; trabajador_id?: string; nombre?: string; trabajador_nombre?: string; alias?: string } | null | undefined): boolean {
    if (!t) return false;
    const user = this.usuarioActual();
    if (!user) return false;

    const tId = (t.trabajador_id || t.id || '').trim().toLowerCase();
    const tNombre = (t.trabajador_nombre || t.nombre || t.alias || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const uId = user.id.toLowerCase();
    const uUser = user.usuario
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    const uNombre = user.nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    // Coincidencia de ID directo
    if (tId && (tId === uId || tId === 'trab_' + uUser || tId === 'usr_' + uUser)) {
      return true;
    }

    // Coincidencia exacta de nombre o alias
    if (tNombre && (tNombre === uNombre || tNombre === uUser)) {
      return true;
    }

    // Coincidencia por partes (ej. si el usuario es "Prueba" y el trabajador es "Prueba")
    if (uUser && uUser.length >= 3 && tNombre.includes(uUser)) return true;
    if (uNombre && uNombre.length >= 3 && tNombre.includes(uNombre)) return true;

    return false;
  }

  constructor() {
    this.inicializarUsuarios();
    this.cargarSesionGuardada();
  }

  /**
   * Carga los usuarios desde localStorage o inicializa con el administrador Jeremy
   */
  private inicializarUsuarios(): void {
    const dataGuardada = localStorage.getItem(STORAGE_KEYS.USUARIOS);
    if (dataGuardada) {
      try {
        const parsed: Usuario[] = JSON.parse(dataGuardada);
        // Asegurar que siempre exista al menos el administrador Jeremy
        const existeJeremy = parsed.some(
          u => u.usuario.toLowerCase() === ADMIN_POR_DEFECTO.usuario.toLowerCase()
        );
        if (!existeJeremy) {
          parsed.unshift({ ...ADMIN_POR_DEFECTO });
          this.guardarUsuariosEnStorage(parsed);
        }
        this.usuarios.set(parsed);
        return;
      } catch (e) {
        console.error('Error cargando usuarios locales:', e);
      }
    }

    // Si no hay datos, inicializamos con el Administrador Jeremy
    const iniciales = [{ ...ADMIN_POR_DEFECTO }];
    this.usuarios.set(iniciales);
    this.guardarUsuariosEnStorage(iniciales);
  }

  /**
   * Restaura la sesión activa guardada en localStorage si existe.
   * Si no hay sesión previa guardada, permanece sin autenticar para solicitar inicio de sesión.
   */
  private cargarSesionGuardada(): void {
    const sesionGuardada = localStorage.getItem(STORAGE_KEYS.SESION);
    if (sesionGuardada) {
      try {
        const u: Usuario = JSON.parse(sesionGuardada);
        // Validar que el usuario siga existiendo y esté activo
        const usuarioValido = this.usuarios().find(
          item => item.id === u.id && item.activo
        );
        if (usuarioValido) {
          this.usuarioActual.set(usuarioValido);
          return;
        }
      } catch (e) {
        console.error('Error leyendo sesión guardada:', e);
      }
    }

    // Si no hay sesión guardada previa, requerir autenticación
    this.usuarioActual.set(null);
  }

  /**
   * Intenta iniciar sesión con usuario y contraseña
   */
  public login(usuarioInput: string, passwordInput: string): { exito: boolean; mensaje: string } {
    const uTrim = usuarioInput.trim().toLowerCase();
    const pTrim = passwordInput.trim();

    if (!uTrim || !pTrim) {
      return { exito: false, mensaje: 'Por favor ingresa usuario y contraseña' };
    }

    const usuarioEncontrado = this.usuarios().find(
      u => u.usuario.toLowerCase() === uTrim
    );

    if (!usuarioEncontrado) {
      return { exito: false, mensaje: 'Usuario no encontrado en el sistema' };
    }

    if (!usuarioEncontrado.activo) {
      return { exito: false, mensaje: 'Este usuario ha sido desactivado por la administración' };
    }

    if (usuarioEncontrado.password !== pTrim) {
      return { exito: false, mensaje: 'Contraseña incorrecta' };
    }

    // Actualizar último acceso
    const fechaHora = new Date().toLocaleString();
    this.actualizarUsuario(usuarioEncontrado.id, { ultimo_acceso: fechaHora });

    const usuarioActualizado = { ...usuarioEncontrado, ultimo_acceso: fechaHora };
    this.iniciarSesionUsuario(usuarioActualizado);

    return { exito: true, mensaje: `Bienvenido, ${usuarioActualizado.nombre}` };
  }

  /**
   * Cierra la sesión activa (botón Bloquear) y redirige a la pantalla de login
   */
  public logout(): void {
    this.usuarioActual.set(null);
    localStorage.removeItem(STORAGE_KEYS.SESION);
    this.router.navigate(['/login']);
  }

  /**
   * Crea un nuevo usuario en el sistema (Solo para Administradores)
   */
  public crearUsuario(dto: NuevoUsuarioDTO): { exito: boolean; mensaje: string } {
    if (!this.esAdmin()) {
      return { exito: false, mensaje: 'Solo los administradores pueden crear nuevos usuarios' };
    }

    const usuarioTrim = dto.usuario.trim();
    const nombreTrim = dto.nombre.trim();
    const passTrim = dto.password.trim();

    if (!usuarioTrim || !nombreTrim || !passTrim) {
      return { exito: false, mensaje: 'Todos los campos son obligatorios' };
    }

    // Verificar si ya existe un usuario con ese login
    const existe = this.usuarios().some(
      u => u.usuario.toLowerCase() === usuarioTrim.toLowerCase()
    );
    if (existe) {
      return { exito: false, mensaje: `El usuario "${usuarioTrim}" ya existe en el sistema` };
    }

    const nuevo: Usuario = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      usuario: usuarioTrim,
      nombre: nombreTrim,
      email: dto.email?.trim() || '',
      password: passTrim,
      rol: dto.rol || 'USUARIO',
      activo: true,
      created_at: new Date().toISOString().split('T')[0]
    };

    const lista = [...this.usuarios(), nuevo];
    this.usuarios.set(lista);
    this.guardarUsuariosEnStorage(lista);

    // Sincronizar automáticamente en la lista de trabajadores para faenas
    this.sincronizarTrabajador(nuevo);

    return { exito: true, mensaje: `Usuario "${nuevo.nombre}" creado exitosamente con rol ${nuevo.rol === 'ADMIN' ? 'Administrador' : 'Usuario'}` };
  }

  /**
   * Registro público de nuevo usuario desde la pantalla de login.
   * Asigna automáticamente el rol 'USUARIO' y activa la sesión de inmediato.
   */
  public registrarPublico(dto: RegistroUsuarioDTO): { exito: boolean; mensaje: string } {
    const usuarioTrim = dto.usuario.trim();
    const nombreTrim = dto.nombre.trim();
    const passTrim = dto.password.trim();

    if (!usuarioTrim || !nombreTrim || !passTrim) {
      return { exito: false, mensaje: 'Todos los campos son obligatorios' };
    }

    if (passTrim.length < 3) {
      return { exito: false, mensaje: 'La contraseña debe tener al menos 3 caracteres' };
    }

    // Verificar si ya existe un usuario con ese nombre de usuario
    const existe = this.usuarios().some(
      u => u.usuario.toLowerCase() === usuarioTrim.toLowerCase()
    );
    if (existe) {
      return { exito: false, mensaje: `El usuario "${usuarioTrim}" ya está registrado en el sistema` };
    }

    const nuevo: Usuario = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      usuario: usuarioTrim,
      nombre: nombreTrim,
      email: dto.email?.trim() || '',
      password: passTrim,
      rol: 'USUARIO', // Siempre rol USUARIO para registro público
      activo: true,
      created_at: new Date().toISOString().split('T')[0]
    };

    const lista = [...this.usuarios(), nuevo];
    this.usuarios.set(lista);
    this.guardarUsuariosEnStorage(lista);

    // Sincronizar automáticamente en la lista de trabajadores de patio
    this.sincronizarTrabajador(nuevo);

    // Iniciar sesión inmediatamente con el nuevo usuario
    this.iniciarSesionUsuario(nuevo);

    return { exito: true, mensaje: `¡Cuenta creada con éxito! Bienvenido, ${nuevo.nombre}` };
  }

  /**
   * Sincroniza el usuario como trabajador disponible en el patio (boya_trabajadores)
   */
  private sincronizarTrabajador(nuevo: Usuario): void {
    try {
      const rawTrab = localStorage.getItem('boya_trabajadores');
      let listaTrab: any[] = rawTrab ? JSON.parse(rawTrab) : [];
      const yaExisteTrab = listaTrab.some(
        t => (t.nombre || '').toLowerCase() === nuevo.nombre.toLowerCase() || (t.alias || '').toLowerCase() === nuevo.usuario.toLowerCase()
      );
      if (!yaExisteTrab) {
        listaTrab.push({
          id: 'trab_' + nuevo.usuario.toLowerCase().replace(/\s+/g, '_'),
          nombre: nuevo.nombre,
          alias: nuevo.usuario,
          activo: true,
          created_at: nuevo.created_at
        });
        localStorage.setItem('boya_trabajadores', JSON.stringify(listaTrab));
      }
    } catch (e) {
      console.warn('Error sincronizando con lista de trabajadores:', e);
    }
  }

  /**
   * Actualiza datos de un usuario existente
   */
  public actualizarUsuario(id: string, cambios: Partial<Usuario>): { exito: boolean; mensaje: string } {
    const lista = this.usuarios().map(u => {
      if (u.id === id) {
        return { ...u, ...cambios };
      }
      return u;
    });

    this.usuarios.set(lista);
    this.guardarUsuariosEnStorage(lista);

    // Si el usuario actualizado es el usuario en sesión, refrescamos su sesión
    if (this.usuarioActual()?.id === id) {
      const sesionActualizada = lista.find(u => u.id === id);
      if (sesionActualizada) {
        this.iniciarSesionUsuario(sesionActualizada);
      }
    }

    return { exito: true, mensaje: 'Usuario actualizado correctamente' };
  }

  /**
   * Cambia la contraseña de cualquier usuario (para el Administrador)
   */
  public cambiarPasswordUsuario(id: string, nuevaClave: string): { exito: boolean; mensaje: string } {
    if (!this.esAdmin()) {
      return { exito: false, mensaje: 'Permiso denegado: solo Administradores pueden cambiar claves' };
    }

    const claveTrim = nuevaClave.trim();
    if (!claveTrim) {
      return { exito: false, mensaje: 'La contraseña no puede estar vacía' };
    }

    return this.actualizarUsuario(id, { password: claveTrim });
  }

  /**
   * Permite al usuario actual cambiar sus propias credenciales (Usuario, Nombre y Clave)
   */
  public cambiarMisCredenciales(nuevoUsuario: string, nuevoNombre: string, nuevaClave?: string): { exito: boolean; mensaje: string } {
    const sesion = this.usuarioActual();
    if (!sesion) {
      return { exito: false, mensaje: 'No hay una sesión activa' };
    }

    const uTrim = nuevoUsuario.trim();
    const nTrim = nuevoNombre.trim();

    if (!uTrim || !nTrim) {
      return { exito: false, mensaje: 'Usuario y Nombre son requeridos' };
    }

    // Si cambió el nombre de usuario, comprobar que no colisione con otro
    const colision = this.usuarios().some(
      u => u.id !== sesion.id && u.usuario.toLowerCase() === uTrim.toLowerCase()
    );
    if (colision) {
      return { exito: false, mensaje: `El nombre de usuario "${uTrim}" ya está en uso` };
    }

    const cambios: Partial<Usuario> = {
      usuario: uTrim,
      nombre: nTrim
    };

    if (nuevaClave && nuevaClave.trim()) {
      cambios.password = nuevaClave.trim();
    }

    return this.actualizarUsuario(sesion.id, cambios);
  }

  /**
   * Elimina un usuario del sistema (no se permite auto-eliminarse)
   */
  public eliminarUsuario(id: string): { exito: boolean; mensaje: string } {
    if (!this.esAdmin()) {
      return { exito: false, mensaje: 'Solo los administradores pueden eliminar usuarios' };
    }

    if (this.usuarioActual()?.id === id) {
      return { exito: false, mensaje: 'No puedes eliminar tu propia cuenta de administrador en sesión' };
    }

    const lista = this.usuarios().filter(u => u.id !== id);
    this.usuarios.set(lista);
    this.guardarUsuariosEnStorage(lista);

    return { exito: true, mensaje: 'Usuario eliminado del sistema' };
  }

  /**
   * Alterna el estado activo / inactivo de un usuario
   */
  public alternarEstadoActivo(id: string): { exito: boolean; mensaje: string } {
    if (this.usuarioActual()?.id === id) {
      return { exito: false, mensaje: 'No puedes desactivar tu propia cuenta en sesión' };
    }

    const user = this.usuarios().find(u => u.id === id);
    if (!user) {
      return { exito: false, mensaje: 'Usuario no encontrado' };
    }

    const nuevoEstado = !user.activo;
    return this.actualizarUsuario(id, { activo: nuevoEstado });
  }

  private iniciarSesionUsuario(u: Usuario): void {
    this.usuarioActual.set(u);
    localStorage.setItem(STORAGE_KEYS.SESION, JSON.stringify(u));
  }

  private guardarUsuariosEnStorage(lista: Usuario[]): void {
    localStorage.setItem(STORAGE_KEYS.USUARIOS, JSON.stringify(lista));
  }
}
