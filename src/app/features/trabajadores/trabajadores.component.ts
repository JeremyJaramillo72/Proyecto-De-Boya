import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';

export interface FaenaTrabajadorItem {
  id: string;
  tipo: 'DESCARGA' | 'EMBARQUE';
  operacionId: string;
  fecha: string;
  titulo: string;
  detalle: string;
  observaciones?: string;
  monto: number;
  pagado: boolean;
  trabajadorId: string;
}

@Component({
  selector: 'app-trabajadores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './trabajadores.component.html',
  styleUrl: './trabajadores.component.css'
})
export class TrabajadoresComponent {
  dataService = inject(DataService);
  authService = inject(AuthService);
  router = inject(Router);

  mostrarFormulario = signal<boolean>(false);
  nombre = '';
  alias = '';
  telefono = '';

  // MODAL DE AUDITORÍA DIRECTA DE UN TRABAJADOR
  trabajadorAuditoria = signal<any | null>(null);

  // MODAL DE CONFIRMACIÓN DE REINICIO A CERO ($0)
  modalLimpiarCuentasAbierto = signal<boolean>(false);

  // TOAST DE NOTIFICACIÓN
  mensajeExito = signal<string>('');

  balancesTrabajadores = computed(() => {
    let lista = this.dataService.trabajadores();
    if (this.authService.esUsuario()) {
      lista = lista.filter(t => this.authService.esMiTrabajador(t));
    }
    const descargas = this.dataService.descargas();
    const embarques = this.dataService.embarques();

    return lista.map(t => {
      let totalGanado = 0;
      let totalPagado = 0;
      let totalPendiente = 0;
      let cantidadFaenas = 0;

      for (const d of descargas) {
        for (const dt of d.trabajadores || []) {
          if (dt.trabajador_id === t.id) {
            totalGanado += dt.monto_individual;
            cantidadFaenas++;
            if (dt.pagado) totalPagado += dt.monto_individual;
            else totalPendiente += dt.monto_individual;
          }
        }
      }

      for (const e of embarques) {
        for (const et of e.trabajadores || []) {
          if (et.trabajador_id === t.id) {
            totalGanado += et.monto_individual;
            cantidadFaenas++;
            if (et.pagado) totalPagado += et.monto_individual;
            else totalPendiente += et.monto_individual;
          }
        }
      }

      return {
        id: t.id,
        nombre: t.nombre,
        alias: t.alias,
        telefono: t.telefono,
        total_ganado: totalGanado,
        total_pagado: totalPagado,
        total_pendiente: totalPendiente,
        cantidad_faenas: cantidadFaenas
      };
    }).sort((a, b) => b.total_pendiente - a.total_pendiente);
  });

  // Muestra TODAS las faenas asociadas al trabajador seleccionado en el modal
  faenasDelTrabajador = computed<FaenaTrabajadorItem[]>(() => {
    const t = this.trabajadorAuditoria();
    if (!t) return [];

    const descargas = this.dataService.descargas();
    const embarques = this.dataService.embarques();
    const resultado: FaenaTrabajadorItem[] = [];

    // 1. Descargas (Bajadas de Madera)
    for (const d of descargas) {
      for (const dt of d.trabajadores || []) {
        if (dt.trabajador_id === t.id) {
          resultado.push({
            id: 'desc_' + d.id + '_' + dt.trabajador_id,
            tipo: 'DESCARGA',
            operacionId: d.id,
            fecha: d.fecha,
            titulo: 'Bajada de Madera',
            detalle: `${d.cantidad_carros} Carro(s) • ${d.filas_por_carro} filas ($${d.total_pago.toFixed(2)} total ÷ ${Math.max(d.trabajadores.length, 1)} pers.)`,
            observaciones: d.observaciones,
            monto: dt.monto_individual,
            pagado: dt.pagado,
            trabajadorId: dt.trabajador_id
          });
        }
      }
    }

    // 2. Embarques de Tráilers
    for (const e of embarques) {
      for (const et of e.trabajadores || []) {
        if (et.trabajador_id === t.id) {
          resultado.push({
            id: 'emb_' + e.id + '_' + et.trabajador_id,
            tipo: 'EMBARQUE',
            operacionId: e.id,
            fecha: e.fecha,
            titulo: 'Embarque de Tráiler',
            detalle: `${e.cantidad_trailers} Tráiler(s) de Bloques`,
            observaciones: e.observaciones,
            monto: et.monto_individual,
            pagado: et.pagado,
            trabajadorId: et.trabajador_id
          });
        }
      }
    }

    // Ordenar de la más reciente a la más antigua
    return resultado.sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  async guardarTrabajador() {
    if (!this.nombre.trim()) return;

    await this.dataService.agregarTrabajador(this.nombre, this.alias, this.telefono);
    this.nombre = '';
    this.alias = '';
    this.telefono = '';
    this.mostrarFormulario.set(false);
    this.mostrarNotificacion('Nuevo trabajador registrado en nómina');
  }

  abrirAuditoria(item: any) {
    this.trabajadorAuditoria.set(item);
  }

  cerrarAuditoria() {
    this.trabajadorAuditoria.set(null);
  }

  async togglePagoEnModal(f: FaenaTrabajadorItem) {
    const nuevo = !f.pagado;
    await this.dataService.cambiarEstadoPago(f.tipo, f.operacionId, f.trabajadorId, nuevo);
    this.mostrarNotificacion(nuevo ? 'Turno marcado como pagado' : 'Pago desmarcado');
  }

  irAReporteCompleto(nombre: string) {
    this.cerrarAuditoria();
    this.router.navigate(['/reportes'], { queryParams: { empleado: nombre } });
  }

  abrirModalLimpiarCuentas() {
    this.modalLimpiarCuentasAbierto.set(true);
  }

  cerrarModalLimpiarCuentas() {
    this.modalLimpiarCuentasAbierto.set(false);
  }

  async confirmarLimpiarCuentas() {
    await this.dataService.reiniciarCuentasACero();
    this.cerrarModalLimpiarCuentas();
    if (this.trabajadorAuditoria()) {
      this.cerrarAuditoria();
    }
    this.mostrarNotificacion('¡Cuentas dejadas en $0.00 limpio! No hay saldos ni deudas pendientes.');
  }

  private mostrarNotificacion(msg: string) {
    this.mensajeExito.set(msg);
    setTimeout(() => this.mensajeExito.set(''), 3500);
  }
}
