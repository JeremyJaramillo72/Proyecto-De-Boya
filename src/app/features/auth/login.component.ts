import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  // Modo actual: 'login' o 'registro'
  modo = signal<'login' | 'registro'>('login');

  // Campos de Inicio de Sesión
  usuario = '';
  password = '';
  mostrarPassword = signal<boolean>(false);

  // Campos de Registro Público
  regNombre = '';
  regUsuario = '';
  regPassword = '';
  regPasswordConfirmacion = '';
  mostrarRegPassword = signal<boolean>(false);

  // Estados de retroalimentación
  mensajeError = signal<string>('');
  mensajeExito = signal<string>('');
  cargando = signal<boolean>(false);

  constructor() {
    // Si ya está autenticado, enviarlo directo al dashboard
    if (this.authService.estaAutenticado()) {
      this.router.navigate(['/dashboard']);
    }
  }

  cambiarModo(nuevoModo: 'login' | 'registro'): void {
    this.modo.set(nuevoModo);
    this.mensajeError.set('');
    this.mensajeExito.set('');
  }

  onSubmit(): void {
    this.mensajeError.set('');
    this.mensajeExito.set('');
    this.cargando.set(true);

    setTimeout(() => {
      const res = this.authService.login(this.usuario, this.password);
      this.cargando.set(false);

      if (res.exito) {
        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      } else {
        this.mensajeError.set(res.mensaje);
      }
    }, 200);
  }

  onRegistro(): void {
    this.mensajeError.set('');
    this.mensajeExito.set('');

    const n = this.regNombre.trim();
    const u = this.regUsuario.trim();
    const p = this.regPassword.trim();
    const pc = this.regPasswordConfirmacion.trim();

    if (!n) {
      this.mensajeError.set('Por favor ingresa tu nombre completo');
      return;
    }
    if (!u) {
      this.mensajeError.set('Por favor ingresa un nombre de usuario');
      return;
    }
    if (!p) {
      this.mensajeError.set('Por favor ingresa una contraseña');
      return;
    }
    if (p.length < 3) {
      this.mensajeError.set('La contraseña debe tener al menos 3 caracteres');
      return;
    }
    if (p !== pc) {
      this.mensajeError.set('Las contraseñas no coinciden. Verifícalas por favor.');
      return;
    }

    this.cargando.set(true);

    setTimeout(() => {
      const res = this.authService.registrarPublico({
        nombre: n,
        usuario: u,
        password: p
      });
      this.cargando.set(false);

      if (res.exito) {
        this.mensajeExito.set(res.mensaje);
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 600);
      } else {
        this.mensajeError.set(res.mensaje);
      }
    }, 250);
  }
}
