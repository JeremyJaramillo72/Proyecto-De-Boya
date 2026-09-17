import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { Usuario, RolUsuario, NuevoUsuarioDTO } from '../../core/models/usuario.models';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css'
})
export class UsuariosComponent {
  authService = inject(AuthService);

  // Modales
  modalCrearAbierto = signal<boolean>(false);
  modalEditarAbierto = signal<boolean>(false);
  modalPasswordAbierto = signal<boolean>(false);

  // Notificaciones
  mensajeExito = signal<string>('');
  mensajeError = signal<string>('');

  // Formulario Nuevo Usuario
  nuevoUsuario: NuevoUsuarioDTO = {
    usuario: '',
    nombre: '',
    password: '',
    rol: 'USUARIO',
    email: ''
  };

  // Usuario en edición
  usuarioEnEdicion = signal<Usuario | null>(null);
  editNombre = '';
  editUsuario = '';
  editRol: RolUsuario = 'USUARIO';
  editActivo = true;

  // Modal Password
  nuevaClave = '';

  // Formulario Mis Credenciales (Sesión actual de Jeremy)
  miNombre = '';
  miUsuario = '';
  miNuevaClave = '';

  constructor() {
    this.cargarDatosSesion();
  }

  cargarDatosSesion(): void {
    const sesion = this.authService.usuarioActual();
    if (sesion) {
      this.miNombre = sesion.nombre;
      this.miUsuario = sesion.usuario;
      this.miNuevaClave = '';
    }
  }

  // --- CREAR USUARIO ---
  abrirModalCrear(): void {
    this.nuevoUsuario = {
      usuario: '',
      nombre: '',
      password: '',
      rol: 'USUARIO',
      email: ''
    };
    this.mensajeError.set('');
    this.modalCrearAbierto.set(true);
  }

  cerrarModalCrear(): void {
    this.modalCrearAbierto.set(false);
  }

  guardarNuevoUsuario(): void {
    this.mensajeError.set('');
    const res = this.authService.crearUsuario(this.nuevoUsuario);
    if (res.exito) {
      this.cerrarModalCrear();
      this.mostrarNotificacion(res.mensaje);
    } else {
      this.mensajeError.set(res.mensaje);
    }
  }

  // --- EDITAR USUARIO ---
  abrirModalEditar(u: Usuario): void {
    this.usuarioEnEdicion.set(u);
    this.editNombre = u.nombre;
    this.editUsuario = u.usuario;
    this.editRol = u.rol;
    this.editActivo = u.activo;
    this.mensajeError.set('');
    this.modalEditarAbierto.set(true);
  }

  cerrarModalEditar(): void {
    this.modalEditarAbierto.set(false);
    this.usuarioEnEdicion.set(null);
  }

  guardarEdicion(): void {
    const u = this.usuarioEnEdicion();
    if (!u) return;

    this.mensajeError.set('');
    const res = this.authService.actualizarUsuario(u.id, {
      nombre: this.editNombre.trim(),
      usuario: this.editUsuario.trim(),
      rol: this.editRol,
      activo: this.editActivo
    });

    if (res.exito) {
      this.cerrarModalEditar();
      this.mostrarNotificacion('Usuario actualizado con éxito');
    } else {
      this.mensajeError.set(res.mensaje);
    }
  }

  // --- CAMBIAR PASSWORD DE USUARIO ---
  abrirModalPassword(u: Usuario): void {
    this.usuarioEnEdicion.set(u);
    this.nuevaClave = '';
    this.mensajeError.set('');
    this.modalPasswordAbierto.set(true);
  }

  cerrarModalPassword(): void {
    this.modalPasswordAbierto.set(false);
    this.usuarioEnEdicion.set(null);
  }

  guardarNuevaPassword(): void {
    const u = this.usuarioEnEdicion();
    if (!u) return;

    if (!this.nuevaClave.trim()) {
      this.mensajeError.set('La nueva contraseña no puede estar vacía');
      return;
    }

    const res = this.authService.cambiarPasswordUsuario(u.id, this.nuevaClave);
    if (res.exito) {
      this.cerrarModalPassword();
      this.mostrarNotificacion(`Contraseña actualizada para ${u.nombre}`);
    } else {
      this.mensajeError.set(res.mensaje);
    }
  }

  // --- ELIMINAR / ALTERNAR ESTADO ---
  eliminarUsuario(u: Usuario): void {
    if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${u.nombre}" (@${u.usuario})? Esta acción no se puede deshacer.`)) {
      const res = this.authService.eliminarUsuario(u.id);
      if (res.exito) {
        this.mostrarNotificacion(res.mensaje);
      } else {
        alert(res.mensaje);
      }
    }
  }

  alternarActivo(u: Usuario): void {
    const res = this.authService.alternarEstadoActivo(u.id);
    if (res.exito) {
      this.mostrarNotificacion(`Estado de "${u.nombre}" actualizado`);
    } else {
      alert(res.mensaje);
    }
  }

  // --- MIS CREDENCIALES (ADMIN JEREMY) ---
  guardarMisCredenciales(): void {
    this.mensajeError.set('');
    const res = this.authService.cambiarMisCredenciales(
      this.miUsuario,
      this.miNombre,
      this.miNuevaClave
    );

    if (res.exito) {
      this.miNuevaClave = '';
      this.cargarDatosSesion();
      this.mostrarNotificacion('Tus credenciales de administrador han sido actualizadas');
    } else {
      this.mensajeError.set(res.mensaje);
    }
  }

  private mostrarNotificacion(msg: string): void {
    this.mensajeExito.set(msg);
    setTimeout(() => this.mensajeExito.set(''), 3500);
  }
}
