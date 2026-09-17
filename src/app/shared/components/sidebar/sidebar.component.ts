import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DataService } from '../../../core/services/data.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  host: {
    class: 'shrink-0 block'
  }
})
export class SidebarComponent {
  dataService = inject(DataService);
  authService = inject(AuthService);

  descargasCount = computed(() => {
    if (this.authService.esUsuario()) {
      return this.dataService.descargas().filter(d => 
        d.trabajadores.some(t => this.authService.esMiTrabajador(t))
      ).length;
    }
    return this.dataService.descargas().length;
  });

  trailersCount = computed(() => {
    if (this.authService.esUsuario()) {
      return this.dataService.embarques().filter(e => 
        e.trabajadores.some(t => this.authService.esMiTrabajador(t))
      ).reduce((acc, e) => acc + Number(e.cantidad_trailers || 0), 0);
    }
    return this.dataService.totalTrailersEmbarcados();
  });

  auditoriaCount = computed(() => {
    if (this.authService.esUsuario()) {
      const descCount = this.dataService.descargas().filter(d => 
        d.trabajadores.some(t => this.authService.esMiTrabajador(t))
      ).length;
      const embCount = this.dataService.embarques().filter(e => 
        e.trabajadores.some(t => this.authService.esMiTrabajador(t))
      ).length;
      return descCount + embCount;
    }
    return this.dataService.descargas().length + this.dataService.embarques().length;
  });

  personalCount = computed(() => {
    if (this.authService.esUsuario()) {
      return 1;
    }
    return this.dataService.trabajadores().length;
  });
}

