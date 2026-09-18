import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
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
  created_at: '2026-09-16'
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private router = inject(Router);

  // Cliente Supabase para sincronización en la nube entre múltiples dispositivos
  private supabase: SupabaseClient | null = null;
  public isUsingSupabase = signal<boolean>(false);
  public sincronizando = signal<boolean>(false);

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

    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const uId = normalize(user.id || '');
    const uUser = normalize(user.usuario || '');
    const uNombre = normalize(user.nombre || '');

    const tId = normalize(t.id || t.trabajador_id || '');
    const tNombre = normalize(t.trabajador_nombre || t.nombre || t.alias || '');

    // Coincidencia de ID directo
    if (tId && (tId === uId || tId === 'trab_' + uUser || tId === 'usr_' + uUser)) {
      return true;
    }

    // Coincidencia exacta de nombre o alias
    if (tNombre && (tNombre === uNombre || tNombre === uUser)) {
      return true;
    }

    // Coincidencia bidireccional de usuario
    if (uUser && uUser.length >= 3 && (tNombre.includes(uUser) || uUser.includes(tNombre))) {
      return true;
    }

    // Coincidencia bidireccional de nombre completo
    if (uNombre && uNombre.length >= 3 && (tNombre.includes(uNombre) || uNombre.includes(tNombre))) {
      return true;
    }

    // Coincidencia por primera palabra del nombre (ej. "Marco" de "Marco Arévalo")
    const uPrimerNombre = uNombre.split(' ')[0];
    if (uPrimerNombre && uPrimerNombre.length >= 3 && (tNombre.includes(uPrimerNombre) || uPrimerNombre.includes(tNombre))) {
      return true;
    }

    return false;
  }

  constructor() {
    this.inicializarSupabase();
    this.inicializarUsuariosLocales();
    this.cargarSesionGuardada();
    // Sincronizar en segundo plano con Supabase para traer usuarios de otros dispositivos
    this.sincronizarConSupabase();
  }

  private inicializarSupabase(): void {
    if (environment.supabaseUrl && environment.supabaseAnonKey && environment.supabaseUrl.startsWith('http')) {
      try {
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
        this.isUsingSupabase.set(true);
      } catch (err) {
        console.warn('Error inicializando cliente Supabase en AuthService:', err);
      }
    }
  }

  private parseAuthTag(text: string | null | undefined): { id?: string; usuario?: string; nombre?: string; pass: string; rol: RolUsuario; email?: string; ultimo_acceso?: string } | null {
    if (!text) return null;
    const match = text.match(/<!--usr_auth:(.*?)-->/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      return null;
    }
  }

  private buildAuthTag(user: Usuario, currentPhone?: string | null): string {
    const cleanPhone = (currentPhone || '').replace(/<!--usr_auth:.*?-->/g, '').trim();
    const payload = JSON.stringify({
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      pass: user.password,
      rol: user.rol,
      email: user.email || '',
      ultimo_acceso: user.ultimo_acceso || ''
    });
    const tag = `<!--usr_auth:${payload}-->`;
    return cleanPhone ? `${cleanPhone} ${tag}` : tag;
  }

  /**
   * Sincroniza los usuarios con Supabase para que cualquier cuenta creada en el móvil
   * esté disponible de inmediato en la computadora y viceversa.
   */
  public async sincronizarConSupabase(): Promise<void> {
    if (!this.isUsingSupabase() || !this.supabase) return;
    this.sincronizando.set(true);

    try {
      let cloudUsers: Usuario[] = [];
      let existeTablaUsuarios = false;

      // 1. Si existe la tabla dedicada 'usuarios', cargar sus cuentas
      const { data: uData, error: uErr } = await this.supabase
        .from('usuarios')
        .select('*');

      if (!uErr && uData) {
        existeTablaUsuarios = true;
        cloudUsers = uData.map(row => ({
          id: row.id,
          usuario: row.usuario,
          nombre: row.nombre,
          email: row.email || '',
          password: row.password,
          rol: row.rol || 'USUARIO',
          activo: row.activo !== false,
          ultimo_acceso: row.ultimo_acceso,
          created_at: row.created_at
        }));
      }

      // 2. Revisar también 'trabajadores' por si hay cuentas con auth tag
      const { data: trabData, error: trabErr } = await this.supabase
        .from('trabajadores')
        .select('*');

      if (!trabErr && trabData) {
        let jeremyEncontrado = cloudUsers.some(
          u => u.usuario.toLowerCase() === ADMIN_POR_DEFECTO.usuario.toLowerCase()
        );

        for (const row of trabData) {
          const auth = this.parseAuthTag(row.telefono);
          if (auth) {
            const uTag: Usuario = {
              id: auth.id || row.id,
              usuario: auth.usuario || row.alias || row.nombre,
              nombre: auth.nombre || row.nombre,
              email: auth.email || '',
              password: auth.pass,
              rol: auth.rol || 'USUARIO',
              activo: row.activo !== false,
              ultimo_acceso: auth.ultimo_acceso,
              created_at: row.created_at
            };

            const yaEnLista = cloudUsers.some(
              c => c.usuario.toLowerCase() === uTag.usuario.toLowerCase()
            );

            if (!yaEnLista) {
              cloudUsers.push(uTag);
              // Si la tabla formal 'usuarios' ya existe, migrar este usuario a dicha tabla
              if (existeTablaUsuarios) {
                await this.guardarUsuarioEnNube(uTag);
              }
            }

            if (uTag.usuario.toLowerCase() === ADMIN_POR_DEFECTO.usuario.toLowerCase()) {
              jeremyEncontrado = true;
            }
          }
        }

        // Si Jeremy no tiene auth tag en Supabase aún, agregárselo
        if (!jeremyEncontrado) {
          const jeremyRow = trabData.find(
            r => (r.alias || '').toLowerCase() === 'jeremy' || (r.nombre || '').toLowerCase() === 'jeremy'
          );
          const tagJeremy = this.buildAuthTag(ADMIN_POR_DEFECTO, jeremyRow?.telefono);
          if (jeremyRow) {
            await this.supabase.from('trabajadores').update({ telefono: tagJeremy }).eq('id', jeremyRow.id);
          } else {
            await this.supabase.from('trabajadores').insert({
              nombre: ADMIN_POR_DEFECTO.nombre,
              alias: ADMIN_POR_DEFECTO.usuario,
              telefono: tagJeremy,
              activo: true
            });
          }
          if (!cloudUsers.some(c => c.usuario.toLowerCase() === ADMIN_POR_DEFECTO.usuario.toLowerCase())) {
            cloudUsers.unshift({ ...ADMIN_POR_DEFECTO });
          }
        }
      }

      await this.fusionarUsuarios(cloudUsers);
    } catch (e) {
      console.warn('Error en sincronización en la nube de usuarios:', e);
    } finally {
      this.sincronizando.set(false);
    }
  }

  private async fusionarUsuarios(cloudUsers: Usuario[]): Promise<void> {
    const mapa = new Map<string, Usuario>();

    // Primero agregamos los de la nube
    for (const u of cloudUsers) {
      mapa.set(u.usuario.toLowerCase(), u);
    }

    // Si localmente hay usuarios creados sin conexión o en este dispositivo, los subimos a la nube
    const locales = this.usuarios();
    for (const localUser of locales) {
      const key = localUser.usuario.toLowerCase();
      if (!mapa.has(key)) {
        mapa.set(key, localUser);
        await this.guardarUsuarioEnNube(localUser);
      }
    }

    // Asegurar que siempre esté Jeremy
    if (!mapa.has(ADMIN_POR_DEFECTO.usuario.toLowerCase())) {
      mapa.set(ADMIN_POR_DEFECTO.usuario.toLowerCase(), { ...ADMIN_POR_DEFECTO });
    }

    const listaFinal = Array.from(mapa.values());
    this.usuarios.set(listaFinal);
    this.guardarUsuariosEnStorage(listaFinal);

    // Si hay sesión activa, refrescar sus datos
    const actual = this.usuarioActual();
    if (actual) {
      const match = listaFinal.find(
        u => u.id === actual.id || u.usuario.toLowerCase() === actual.usuario.toLowerCase()
      );
      if (match) {
        this.usuarioActual.set(match);
      }
    }
  }

  public async buscarUsuarioEnNube(usuarioInput: string): Promise<Usuario | null> {
    if (!this.isUsingSupabase() || !this.supabase) return null;
    const uTrim = usuarioInput.trim().toLowerCase();

    try {
      // 1. Probar en tabla dedicada 'usuarios'
      const { data: uData, error: uErr } = await this.supabase
        .from('usuarios')
        .select('*')
        .ilike('usuario', uTrim)
        .limit(1);

      if (!uErr && uData && uData.length > 0) {
        const row = uData[0];
        const u: Usuario = {
          id: row.id,
          usuario: row.usuario,
          nombre: row.nombre,
          email: row.email || '',
          password: row.password,
          rol: row.rol || 'USUARIO',
          activo: row.activo !== false,
          ultimo_acceso: row.ultimo_acceso,
          created_at: row.created_at
        };
        this.incorporarUsuarioLocal(u);
        return u;
      }

      // 2. Probar en tabla 'trabajadores'
      const { data: trabData } = await this.supabase
        .from('trabajadores')
        .select('*');

      for (const row of trabData || []) {
        const auth = this.parseAuthTag(row.telefono);
        if (auth) {
          const authUser = (auth.usuario || row.alias || row.nombre || '').trim().toLowerCase();
          const authNom = (auth.nombre || row.nombre || '').trim().toLowerCase();
          if (authUser === uTrim || authNom === uTrim || row.alias?.toLowerCase() === uTrim || row.nombre?.toLowerCase() === uTrim) {
            const u: Usuario = {
              id: auth.id || row.id,
              usuario: auth.usuario || row.alias || row.nombre,
              nombre: auth.nombre || row.nombre,
              email: auth.email || '',
              password: auth.pass,
              rol: auth.rol || 'USUARIO',
              activo: row.activo !== false,
              ultimo_acceso: auth.ultimo_acceso,
              created_at: row.created_at
            };
            this.incorporarUsuarioLocal(u);
            return u;
          }
        }
      }
    } catch (e) {
      console.warn('Error buscando usuario en tiempo real en Supabase:', e);
    }
    return null;
  }

  private incorporarUsuarioLocal(u: Usuario): void {
    const actuales = this.usuarios();
    const ya = actuales.some(item => item.usuario.toLowerCase() === u.usuario.toLowerCase());
    if (!ya) {
      const nueva = [...actuales, u];
      this.usuarios.set(nueva);
      this.guardarUsuariosEnStorage(nueva);
    }
  }

  public async guardarUsuarioEnNube(u: Usuario): Promise<void> {
    if (!this.isUsingSupabase() || !this.supabase) return;
    try {
      // 1. Probar tabla 'usuarios'
      const { error: errU } = await this.supabase
        .from('usuarios')
        .upsert({
          id: u.id,
          usuario: u.usuario,
          nombre: u.nombre,
          email: u.email || '',
          password: u.password,
          rol: u.rol,
          activo: u.activo,
          ultimo_acceso: u.ultimo_acceso || null,
          created_at: u.created_at || new Date().toISOString()
        });

      if (!errU) return;

      // 2. Fallback en 'trabajadores'
      const { data: trabData } = await this.supabase
        .from('trabajadores')
        .select('*');

      let existente = null;
      for (const row of trabData || []) {
        const auth = this.parseAuthTag(row.telefono);
        if (auth && (auth.id === u.id || auth.usuario?.toLowerCase() === u.usuario.toLowerCase())) {
          existente = row;
          break;
        }
        if ((row.alias || '').toLowerCase() === u.usuario.toLowerCase() || (row.nombre || '').toLowerCase() === u.nombre.toLowerCase()) {
          existente = row;
          break;
        }
      }

      const authTag = this.buildAuthTag(u, existente ? existente.telefono : '');

      if (existente) {
        await this.supabase
          .from('trabajadores')
          .update({
            nombre: u.nombre,
            alias: u.usuario,
            telefono: authTag,
            activo: u.activo
          })
          .eq('id', existente.id);
      } else {
        await this.supabase
          .from('trabajadores')
          .insert({
            nombre: u.nombre,
            alias: u.usuario,
            telefono: authTag,
            activo: u.activo
          });
      }
    } catch (e) {
      console.warn('Error guardando usuario en nube:', e);
    }
  }

  public async eliminarUsuarioEnNube(u: Usuario): Promise<void> {
    if (!this.isUsingSupabase() || !this.supabase) return;
    try {
      await this.supabase.from('usuarios').delete().eq('id', u.id);
    } catch (e) {}

    try {
      const { data: trabData } = await this.supabase
        .from('trabajadores')
        .select('*');

      for (const row of trabData || []) {
        const auth = this.parseAuthTag(row.telefono);
        const coincide = (auth && (auth.id === u.id || auth.usuario?.toLowerCase() === u.usuario.toLowerCase())) ||
          (row.alias || '').toLowerCase() === u.usuario.toLowerCase() ||
          (row.nombre || '').toLowerCase() === u.nombre.toLowerCase();
        if (coincide) {
          const clean = (row.telefono || '').replace(/<!--usr_auth:.*?-->/g, '').trim();
          await this.supabase
            .from('trabajadores')
            .update({ telefono: clean, activo: false })
            .eq('id', row.id);
        }
      }
    } catch (e) {}
  }

  /**
   * Carga los usuarios desde localStorage o inicializa con el administrador Jeremy
   */
  private inicializarUsuariosLocales(): void {
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
  public async login(usuarioInput: string, passwordInput: string): Promise<{ exito: boolean; mensaje: string }> {
    const uTrim = usuarioInput.trim().toLowerCase();
    const pTrim = passwordInput.trim();

    if (!uTrim || !pTrim) {
      return { exito: false, mensaje: 'Por favor ingresa usuario y contraseña' };
    }

    let usuarioEncontrado = this.usuarios().find(
      u => u.usuario.toLowerCase() === uTrim
    );

    // Si no está localmente o la contraseña no coincide localmente, buscar en tiempo real en la nube
    if (!usuarioEncontrado || (this.isUsingSupabase() && usuarioEncontrado.password !== pTrim)) {
      const uCloud = await this.buscarUsuarioEnNube(uTrim);
      if (uCloud) {
        usuarioEncontrado = uCloud;
      }
    }

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
    await this.actualizarUsuario(usuarioEncontrado.id, { ultimo_acceso: fechaHora });

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
  public async crearUsuario(dto: NuevoUsuarioDTO): Promise<{ exito: boolean; mensaje: string }> {
    if (!this.esAdmin()) {
      return { exito: false, mensaje: 'Solo los administradores pueden crear nuevos usuarios' };
    }

    const usuarioTrim = dto.usuario.trim();
    const nombreTrim = dto.nombre.trim();
    const passTrim = dto.password.trim();

    if (!usuarioTrim || !nombreTrim || !passTrim) {
      return { exito: false, mensaje: 'Todos los campos son obligatorios' };
    }

    // Verificar si ya existe en la nube o local
    let existe = this.usuarios().some(
      u => u.usuario.toLowerCase() === usuarioTrim.toLowerCase()
    );
    if (!existe && this.isUsingSupabase()) {
      const uCloud = await this.buscarUsuarioEnNube(usuarioTrim);
      if (uCloud) existe = true;
    }
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

    // Guardar en la nube inmediatamente
    await this.guardarUsuarioEnNube(nuevo);

    // Sincronizar automáticamente en la lista de trabajadores para faenas
    this.sincronizarTrabajador(nuevo);

    return { exito: true, mensaje: `Usuario "${nuevo.nombre}" creado exitosamente con rol ${nuevo.rol === 'ADMIN' ? 'Administrador' : 'Usuario'}` };
  }

  /**
   * Registro público de nuevo usuario desde la pantalla de login.
   * Asigna automáticamente el rol 'USUARIO' y activa la sesión de inmediato.
   */
  public async registrarPublico(dto: RegistroUsuarioDTO): Promise<{ exito: boolean; mensaje: string }> {
    const usuarioTrim = dto.usuario.trim();
    const nombreTrim = dto.nombre.trim();
    const passTrim = dto.password.trim();

    if (!usuarioTrim || !nombreTrim || !passTrim) {
      return { exito: false, mensaje: 'Todos los campos son obligatorios' };
    }

    if (passTrim.length < 3) {
      return { exito: false, mensaje: 'La contraseña debe tener al menos 3 caracteres' };
    }

    // Verificar si ya existe un usuario con ese nombre de usuario (local o nube)
    let existe = this.usuarios().some(
      u => u.usuario.toLowerCase() === usuarioTrim.toLowerCase()
    );
    if (!existe && this.isUsingSupabase()) {
      const uCloud = await this.buscarUsuarioEnNube(usuarioTrim);
      if (uCloud) existe = true;
    }
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

    // Guardar en la nube inmediatamente
    await this.guardarUsuarioEnNube(nuevo);

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
  public async actualizarUsuario(id: string, cambios: Partial<Usuario>): Promise<{ exito: boolean; mensaje: string }> {
    let usuarioModificado: Usuario | null = null;
    const lista = this.usuarios().map(u => {
      if (u.id === id) {
        usuarioModificado = { ...u, ...cambios };
        return usuarioModificado;
      }
      return u;
    });

    this.usuarios.set(lista);
    this.guardarUsuariosEnStorage(lista);

    // Si el usuario actualizado es el usuario en sesión, refrescamos su sesión
    if (this.usuarioActual()?.id === id && usuarioModificado) {
      this.iniciarSesionUsuario(usuarioModificado);
    }

    if (usuarioModificado) {
      await this.guardarUsuarioEnNube(usuarioModificado);
    }

    return { exito: true, mensaje: 'Usuario actualizado correctamente' };
  }

  /**
   * Cambia la contraseña de cualquier usuario (para el Administrador)
   */
  public async cambiarPasswordUsuario(id: string, nuevaClave: string): Promise<{ exito: boolean; mensaje: string }> {
    if (!this.esAdmin()) {
      return { exito: false, mensaje: 'Permiso denegado: solo Administradores pueden cambiar claves' };
    }

    const claveTrim = nuevaClave.trim();
    if (!claveTrim) {
      return { exito: false, mensaje: 'La contraseña no puede estar vacía' };
    }

    return await this.actualizarUsuario(id, { password: claveTrim });
  }

  /**
   * Permite al usuario actual cambiar sus propias credenciales (Usuario, Nombre y Clave)
   */
  public async cambiarMisCredenciales(nuevoUsuario: string, nuevoNombre: string, nuevaClave?: string): Promise<{ exito: boolean; mensaje: string }> {
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

    return await this.actualizarUsuario(sesion.id, cambios);
  }

  /**
   * Elimina un usuario del sistema (no se permite auto-eliminarse)
   */
  public async eliminarUsuario(id: string): Promise<{ exito: boolean; mensaje: string }> {
    if (!this.esAdmin()) {
      return { exito: false, mensaje: 'Solo los administradores pueden eliminar usuarios' };
    }

    if (this.usuarioActual()?.id === id) {
      return { exito: false, mensaje: 'No puedes eliminar tu propia cuenta de administrador en sesión' };
    }

    const usuarioAEliminar = this.usuarios().find(u => u.id === id);

    const lista = this.usuarios().filter(u => u.id !== id);
    this.usuarios.set(lista);
    this.guardarUsuariosEnStorage(lista);

    if (usuarioAEliminar) {
      await this.eliminarUsuarioEnNube(usuarioAEliminar);
    }

    return { exito: true, mensaje: 'Usuario eliminado del sistema' };
  }

  /**
   * Alterna el estado activo / inactivo de un usuario
   */
  public async alternarEstadoActivo(id: string): Promise<{ exito: boolean; mensaje: string }> {
    if (this.usuarioActual()?.id === id) {
      return { exito: false, mensaje: 'No puedes desactivar tu propia cuenta en sesión' };
    }

    const user = this.usuarios().find(u => u.id === id);
    if (!user) {
      return { exito: false, mensaje: 'Usuario no encontrado' };
    }

    const nuevoEstado = !user.activo;
    return await this.actualizarUsuario(id, { activo: nuevoEstado });
  }

  private iniciarSesionUsuario(u: Usuario): void {
    this.usuarioActual.set(u);
    localStorage.setItem(STORAGE_KEYS.SESION, JSON.stringify(u));
  }

  private guardarUsuariosEnStorage(lista: Usuario[]): void {
    localStorage.setItem(STORAGE_KEYS.USUARIOS, JSON.stringify(lista));
  }
}
