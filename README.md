# 🪵 BoyaControl - Sistema de Gestión de Madera y Embarques de Tráilers

Sistema web moderno desarrollado en **Angular 21 (Standalone, Signals, Tailwind CSS)** preparado para conectarse con **Supabase (PostgreSQL)** y desplegarse 100% gratis en **Vercel**.

Diseñado para digitalizar el control operativo y nómina de aserraderos y centros de acopio de **madera de boya (balsa)**.

---

## 🚀 Inicio Rápido (En tu computadora)

1. Abre la terminal en esta carpeta:
   ```bash
   npm start
   ```
2. Abre tu navegador en:
   ```
   http://localhost:4200
   ```
> **Nota:** La aplicación cuenta con un **Modo Demo / Offline Automático**. Ya viene precargada con los registros reales de tus libretas (semana del 20 al 26 de abril y mayo) para que puedas probarla inmediatamente sin tener que configurar nada.

---

## 📦 Conexión a Supabase (100% Gratis)

1. Regístrate gratis en [https://supabase.com](https://supabase.com) y crea un nuevo proyecto.
2. En el menú lateral izquierdo, entra a **SQL Editor**.
3. Abre el archivo [`supabase/schema.sql`](supabase/schema.sql) de este proyecto, copia todo su contenido, pégalo en Supabase y presiona **Run**.
4. Ve a **Project Settings -> API** en Supabase y copia:
   * **Project URL**
   * **Project API keys (anon public)**
5. Pégalos en el archivo [`src/environments/environment.ts`](src/environments/environment.ts):
   ```typescript
   export const environment = {
     production: false,
     supabaseUrl: 'https://tu-proyecto.supabase.co',
     supabaseAnonKey: 'tu-clave-anon-publica'
   };
   ```
¡Listo! La aplicación detectará automáticamente Supabase y sincronizará en tiempo real.

---

## ☁️ Despliegue en Vercel (100% Gratis)

La aplicación ya incluye el archivo de configuración [`vercel.json`](vercel.json) optimizado para Angular SPA.

### Opción 1: Desde GitHub (Recomendada)
1. Sube este proyecto a tu repositorio de GitHub.
2. Entra a [https://vercel.com](https://vercel.com) y haz clic en **Add New -> Project**.
3. Selecciona tu repositorio.
4. En **Framework Preset**, selecciona **Angular**.
5. Haz clic en **Deploy**.

---

## 📋 Módulos y Lógica de Negocio

### 1. 🪵 Bajada de Madera (Carros y Camiones)
* **Fórmula automática:** Cada fila de madera tiene una tarifa de **\$5.00** por carro.
  $$\text{Pago por Persona} = \frac{\text{Carros} \times \text{Filas} \times \$5}{\text{Cantidad de Trabajadores}}$$
* Botón individual para marcar a cada trabajador como **PAGADO** o **PENDIENTE**.

### 2. 🚛 Embarque de Tráilers (Bloques de Boya)
* **Fórmula de carga:** Tarifa de **\$7.00 por persona por cada tráiler cargado**.
* Control individual de cobros (como *(Coronel pagado)* o *PAGADO* en bloque).

### 3. 📈 Reportes & Nómina (Liquidación)
* **Filtros avanzados:** Por rango de fechas (con atajos para la semana de \$147 de abril), por trabajador específico y por estado de pago.
* **Resumen de nómina:** Balance acumulado por persona para saber exactamente cuánto se le adeuda.
* **Exportación a Excel (CSV):** Descarga en un clic para hojas de cálculo.
* **Impresión / Exportar PDF:** Vista lista para imprimir con formato formal de liquidación y firmas de recibido conforme.

### 4. 👥 Personal / Trabajadores
* Directorio de cargadores y descargadores con cálculo de balances en tiempo real.
