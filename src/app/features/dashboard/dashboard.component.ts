import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';

interface TopTrabajador {
  id: string;
  nombre: string;
  total_ganado: number;
  cantidad_faenas: number;
  porcentaje: number;
  estado: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  dataService = inject(DataService);
  authService = inject(AuthService);

  filtroPeriodo = signal<'auto' | 'hoy' | 'historico'>('auto');
  fechaHoy = 'Miércoles, 16 de septiembre de 2026';
  horaActual = '00:46:59';
  private timerId: any;

  ngOnInit() {
    this.actualizarHora();
    this.timerId = setInterval(() => this.actualizarHora(), 1000);
  }

  ngOnDestroy() {
    if (this.timerId) clearInterval(this.timerId);
  }

  private actualizarHora() {
    const ahora = new Date();
    const opciones: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const fechaStr = ahora.toLocaleDateString('es-ES', opciones);
    this.fechaHoy = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
    this.horaActual = ahora.toTimeString().split(' ')[0];
  }

  // MÉTRICAS COMPUTADAS CON DISTINCIÓN DE ROL
  misDescargasCount = computed(() => {
    if (this.authService.esUsuario()) {
      return this.dataService.descargas().filter(d => 
        d.trabajadores.some(t => this.authService.esMiTrabajador(t))
      ).length;
    }
    return this.dataService.descargas().length;
  });

  misCarrosCount = computed(() => {
    if (this.authService.esUsuario()) {
      return this.dataService.descargas()
        .filter(d => d.trabajadores.some(t => this.authService.esMiTrabajador(t)))
        .reduce((sum, d) => sum + Number(d.cantidad_carros || 0), 0);
    }
    return this.dataService.totalCarrosDescargados();
  });

  misTrailersCount = computed(() => {
    if (this.authService.esUsuario()) {
      return this.dataService.embarques()
        .filter(e => e.trabajadores.some(t => this.authService.esMiTrabajador(t)))
        .reduce((sum, e) => sum + Number(e.cantidad_trailers || 0), 0);
    }
    return this.dataService.totalTrailersEmbarcados();
  });

  misDescargasCobrar = computed(() => {
    if (this.authService.esUsuario()) {
      return this.dataService.descargas().reduce((sum, d) => {
        const mi = d.trabajadores.find(t => this.authService.esMiTrabajador(t));
        return sum + (mi ? mi.monto_individual : 0);
      }, 0);
    }
    return this.dataService.descargas().reduce((sum, d) => {
      const individual = d.trabajadores?.[0]?.monto_individual ?? (d.total_pago / (d.trabajadores?.length || 1));
      return sum + individual;
    }, 0);
  });

  totalDescargasPatioTotal = computed(() => {
    return this.dataService.descargas().reduce((sum, d) => sum + d.total_pago, 0);
  });

  miPendienteCobro = computed(() => {
    if (this.authService.esUsuario()) {
      let p = 0;
      for (const d of this.dataService.descargas()) {
        for (const t of d.trabajadores || []) {
          if (this.authService.esMiTrabajador(t) && !t.pagado) p += Number(t.monto_individual || 0);
        }
      }
      for (const e of this.dataService.embarques()) {
        for (const t of e.trabajadores || []) {
          if (this.authService.esMiTrabajador(t) && !t.pagado) p += Number(t.monto_individual || 0);
        }
      }
      return p;
    }
    return this.dataService.totalPendienteCobro();
  });

  miPagadoHistorico = computed(() => {
    if (this.authService.esUsuario()) {
      let p = 0;
      for (const d of this.dataService.descargas()) {
        for (const t of d.trabajadores || []) {
          if (this.authService.esMiTrabajador(t) && t.pagado) p += Number(t.monto_individual || 0);
        }
      }
      for (const e of this.dataService.embarques()) {
        for (const t of e.trabajadores || []) {
          if (this.authService.esMiTrabajador(t) && t.pagado) p += Number(t.monto_individual || 0);
        }
      }
      return p;
    }
    return this.dataService.totalPagadoHistorico();
  });

  miTotalGanado = computed(() => {
    return this.miPagadoHistorico() + this.miPendienteCobro();
  });

  totalNominaRedondeada = computed(() => {
    return Math.round(this.miTotalGanado());
  });

  porcentajePagado = computed(() => {
    const total = this.miTotalGanado();
    if (total <= 0) return 100;
    return Math.round((this.miPagadoHistorico() / total) * 100);
  });

  porcentajePendiente = computed(() => {
    const total = this.miTotalGanado();
    if (total <= 0) return 0;
    return Math.round((this.miPendienteCobro() / total) * 100);
  });

  topTrabajadores = computed<TopTrabajador[]>(() => {
    const lista = this.dataService.trabajadores();
    const descargas = this.dataService.descargas();
    const embarques = this.dataService.embarques();

    const mapa = new Map<string, { nombre: string; total: number; faenas: number }>();
    for (const t of lista) {
      mapa.set(t.id, { nombre: t.alias || t.nombre, total: 0, faenas: 0 });
    }

    for (const d of descargas) {
      for (const dt of d.trabajadores || []) {
        const item = mapa.get(dt.trabajador_id);
        if (item) {
          item.total += dt.monto_individual;
          item.faenas += 1;
        }
      }
    }

    for (const e of embarques) {
      for (const et of e.trabajadores || []) {
        const item = mapa.get(et.trabajador_id);
        if (item) {
          item.total += et.monto_individual;
          item.faenas += 1;
        }
      }
    }

    const items: TopTrabajador[] = [];
    mapa.forEach((val, key) => {
      items.push({
        id: key,
        nombre: val.nombre,
        total_ganado: val.total,
        cantidad_faenas: val.faenas,
        porcentaje: 0,
        estado: 'Activo'
      });
    });

    items.sort((a, b) => b.total_ganado - a.total_ganado);
    const max = items[0]?.total_ganado || 1;
    items.forEach(i => {
      i.porcentaje = Math.min(100, Math.max(15, Math.round((i.total_ganado / max) * 100)));
    });

    return items.slice(0, 5);
  });

  ultimasOperaciones = computed(() => {
    const descargas = this.dataService.descargas().map(d => ({
      id: d.id,
      tipo: 'DESCARGA' as const,
      fecha: d.fecha,
      titulo: `${d.cantidad_carros} Carro(s) • ${d.filas_por_carro} filas`,
      subtitulo: d.trabajadores.map(t => t.trabajador_nombre).join(', '),
      monto: d.trabajadores[0]?.monto_individual ?? (d.total_pago / (d.trabajadores.length || 1)),
      totalCarro: d.total_pago,
      pagado: d.trabajadores.every(t => t.pagado)
    }));

    const embarques = this.dataService.embarques().map(e => ({
      id: e.id,
      tipo: 'EMBARQUE' as const,
      fecha: e.fecha,
      titulo: `${e.cantidad_trailers} Tráiler(s) de Boya`,
      subtitulo: `${e.trabajadores.length} cargadores`,
      monto: e.total_pago,
      totalCarro: e.total_pago,
      pagado: e.trabajadores.every(t => t.pagado)
    }));

    return [...descargas, ...embarques]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 4);
  });

  exportarResumenCSV() {
    const descargas = this.authService.esUsuario()
      ? this.dataService.descargas().filter(d => d.trabajadores.some(t => this.authService.esMiTrabajador(t)))
      : this.dataService.descargas();

    const rows = descargas.map(d => ({
      Fecha: d.fecha,
      Carros: d.cantidad_carros,
      Filas: d.filas_por_carro,
      'A Cobrar': (d.trabajadores.find(t => this.authService.esMiTrabajador(t))?.monto_individual) ?? (d.total_pago / (d.trabajadores?.length || 1)),
      'Total Faena Carro': d.total_pago,
      Trabajadores: d.trabajadores.map(t => t.trabajador_nombre).join(' - ')
    }));
    this.dataService.exportarCSV(rows, 'resumen-operaciones-boya.csv');
  }
}
