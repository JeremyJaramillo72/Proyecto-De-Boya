from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import uuid

app = FastAPI(title="BoyaControl API", version="1.0.0", description="API para registro de madera y embarques de boya")

# Habilitar CORS para comunicarse con Angular
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# MODELOS DE DATOS (PYDANTIC)
# ==========================================
class Trabajador(BaseModel):
    id: str
    nombre: str
    alias: str
    telefono: Optional[str] = ""
    activo: bool = True

class NuevoTrabajador(BaseModel):
    nombre: str
    alias: Optional[str] = None
    telefono: Optional[str] = ""

class DescargaTrabajador(BaseModel):
    trabajador_id: str
    trabajador_nombre: str
    monto_individual: float
    pagado: bool = False
    fecha_pago: Optional[str] = None

class DescargaCreate(BaseModel):
    fecha: str
    cantidad_carros: int
    filas_por_carro: int
    tarifa_por_fila: float = 5.00
    trabajadores_ids: List[str]
    observaciones: Optional[str] = ""

class Descarga(BaseModel):
    id: str
    fecha: str
    cantidad_carros: int
    filas_por_carro: int
    tarifa_por_fila: float
    total_pago: float
    observaciones: Optional[str] = ""
    trabajadores: List[DescargaTrabajador]

class EmbarqueTrabajador(BaseModel):
    trabajador_id: str
    trabajador_nombre: str
    monto_individual: float
    pagado: bool = False
    fecha_pago: Optional[str] = None

class EmbarqueCreate(BaseModel):
    fecha: str
    cantidad_trailers: int
    tarifa_por_persona_trailer: float = 7.00
    trabajadores_ids: List[str]
    observaciones: Optional[str] = ""

class Embarque(BaseModel):
    id: str
    fecha: str
    cantidad_trailers: int
    tarifa_por_persona_trailer: float
    total_pago: float
    observaciones: Optional[str] = ""
    trabajadores: List[EmbarqueTrabajador]

class PagoToggle(BaseModel):
    tipo: str  # 'DESCARGA' o 'EMBARQUE'
    operacion_id: str
    trabajador_id: str
    pagado: bool

# ==========================================
# BASE DE DATOS EN MEMORIA CON DATOS DE FOTOS
# ==========================================
TRABAJADORES_DB = [
    Trabajador(id="trab_marco", nombre="Marco", alias="Marco", activo=True),
    Trabajador(id="trab_coronel", nombre="Coronel", alias="Coronel", activo=True),
    Trabajador(id="trab_jeremy", nombre="Jeremy", alias="Jeremy", activo=True),
    Trabajador(id="trab_josue", nombre="Josué", alias="Josue", activo=True),
    Trabajador(id="trab_erick", nombre="Erick", alias="Erick", activo=True),
    Trabajador(id="trab_adonis", nombre="Adonis", alias="Adonis", activo=True),
    Trabajador(id="trab_kelvin", nombre="Kelvin", alias="Kelvin", activo=True),
    Trabajador(id="trab_edwin", nombre="Edwin", alias="Edwin", activo=True),
    Trabajador(id="trab_johan", nombre="Johan", alias="Johan", activo=True),
]

DESCARGAS_DB: List[Descarga] = []
EMBARQUES_DB: List[Embarque] = []

# ==========================================
# RUTAS DE LA API REST
# ==========================================
@app.get("/")
def home():
    return {
        "status": "online",
        "app": "BoyaControl Backend API (FastAPI)",
        "docs": "/docs",
        "endpoints": ["/api/trabajadores", "/api/descargas", "/api/embarques", "/api/reportes"]
    }

@app.get("/api/trabajadores", response_model=List[Trabajador])
def get_trabajadores():
    return TRABAJADORES_DB

@app.post("/api/trabajadores", response_model=Trabajador)
def create_trabajador(data: NuevoTrabajador):
    nuevo = Trabajador(
        id="trab_" + str(uuid.uuid4())[:8],
        nombre=data.nombre,
        alias=data.alias or data.nombre,
        telefono=data.telefono or "",
        activo=True
    )
    TRABAJADORES_DB.append(nuevo)
    return nuevo

@app.get("/api/descargas", response_model=List[Descarga])
def get_descargas():
    return DESCARGAS_DB

@app.post("/api/descargas", response_model=Descarga)
def create_descarga(data: DescargaCreate):
    total = round(data.cantidad_carros * data.filas_por_carro * data.tarifa_por_fila, 2)
    cant_personas = max(len(data.trabajadores_ids), 1)
    monto_ind = round(total / cant_personas, 2)

    trabajadores_lista = []
    for tid in data.trabajadores_ids:
        t = next((w for w in TRABAJADORES_DB if w.id == tid), None)
        trabajadores_lista.append(DescargaTrabajador(
            trabajador_id=tid,
            trabajador_nombre=t.alias if t else "Trabajador",
            monto_individual=monto_ind,
            pagado=False
        ))

    nueva = Descarga(
        id="desc_" + str(uuid.uuid4())[:8],
        fecha=data.fecha,
        cantidad_carros=data.cantidad_carros,
        filas_por_carro=data.filas_por_carro,
        tarifa_por_fila=data.tarifa_por_fila,
        total_pago=total,
        observaciones=data.observaciones or "",
        trabajadores=trabajadores_lista
    )
    DESCARGAS_DB.insert(0, nueva)
    return nueva

@app.put("/api/descargas/{id}", response_model=Descarga)
def update_descarga(id: str, data: DescargaCreate):
    for i, d in enumerate(DESCARGAS_DB):
        if d.id == id:
            total = round(data.cantidad_carros * data.filas_por_carro * data.tarifa_por_fila, 2)
            cant_personas = max(len(data.trabajadores_ids), 1)
            monto_ind = round(total / cant_personas, 2)

            mapa_pagados = {t.trabajador_id: (t.pagado, t.fecha_pago) for t in d.trabajadores}

            trabajadores_lista = []
            for tid in data.trabajadores_ids:
                t = next((w for w in TRABAJADORES_DB if w.id == tid), None)
                pagado, fecha_pago = mapa_pagados.get(tid, (False, None))
                trabajadores_lista.append(DescargaTrabajador(
                    trabajador_id=tid,
                    trabajador_nombre=t.alias if t else "Trabajador",
                    monto_individual=monto_ind,
                    pagado=pagado,
                    fecha_pago=fecha_pago
                ))

            modificada = Descarga(
                id=id,
                fecha=data.fecha,
                cantidad_carros=data.cantidad_carros,
                filas_por_carro=data.filas_por_carro,
                tarifa_por_fila=data.tarifa_por_fila,
                total_pago=total,
                observaciones=data.observaciones or "",
                trabajadores=trabajadores_lista
            )
            DESCARGAS_DB[i] = modificada
            return modificada

    raise HTTPException(status_code=404, detail="Descarga no encontrada")

@app.delete("/api/descargas/{id}")
def delete_descarga(id: str):
    global DESCARGAS_DB
    DESCARGAS_DB = [d for d in DESCARGAS_DB if d.id != id]
    return {"success": True, "message": "Descarga eliminada"}

@app.get("/api/embarques", response_model=List[Embarque])
def get_embarques():
    return EMBARQUES_DB

@app.post("/api/embarques", response_model=Embarque)
def create_embarque(data: EmbarqueCreate):
    monto_ind = round(data.cantidad_trailers * data.tarifa_por_persona_trailer, 2)
    cant_personas = len(data.trabajadores_ids)
    total = round(monto_ind * cant_personas, 2)

    trabajadores_lista = []
    for tid in data.trabajadores_ids:
        t = next((w for w in TRABAJADORES_DB if w.id == tid), None)
        trabajadores_lista.append(EmbarqueTrabajador(
            trabajador_id=tid,
            trabajador_nombre=t.alias if t else "Trabajador",
            monto_individual=monto_ind,
            pagado=False
        ))

    nuevo = Embarque(
        id="emb_" + str(uuid.uuid4())[:8],
        fecha=data.fecha,
        cantidad_trailers=data.cantidad_trailers,
        tarifa_por_persona_trailer=data.tarifa_por_persona_trailer,
        total_pago=total,
        observaciones=data.observaciones or "",
        trabajadores=trabajadores_lista
    )
    EMBARQUES_DB.insert(0, nuevo)
    return nuevo

@app.put("/api/embarques/{id}", response_model=Embarque)
def update_embarque(id: str, data: EmbarqueCreate):
    for i, e in enumerate(EMBARQUES_DB):
        if e.id == id:
            monto_ind = round(data.cantidad_trailers * data.tarifa_por_persona_trailer, 2)
            cant_personas = len(data.trabajadores_ids)
            total = round(monto_ind * cant_personas, 2)

            mapa_pagados = {t.trabajador_id: (t.pagado, t.fecha_pago) for t in e.trabajadores}

            trabajadores_lista = []
            for tid in data.trabajadores_ids:
                t = next((w for w in TRABAJADORES_DB if w.id == tid), None)
                pagado, fecha_pago = mapa_pagados.get(tid, (False, None))
                trabajadores_lista.append(EmbarqueTrabajador(
                    trabajador_id=tid,
                    trabajador_nombre=t.alias if t else "Trabajador",
                    monto_individual=monto_ind,
                    pagado=pagado,
                    fecha_pago=fecha_pago
                ))

            modificado = Embarque(
                id=id,
                fecha=data.fecha,
                cantidad_trailers=data.cantidad_trailers,
                tarifa_por_persona_trailer=data.tarifa_por_persona_trailer,
                total_pago=total,
                observaciones=data.observaciones or "",
                trabajadores=trabajadores_lista
            )
            EMBARQUES_DB[i] = modificado
            return modificado

    raise HTTPException(status_code=404, detail="Embarque no encontrado")

@app.delete("/api/embarques/{id}")
def delete_embarque(id: str):
    global EMBARQUES_DB
    EMBARQUES_DB = [e for e in EMBARQUES_DB if e.id != id]
    return {"success": True, "message": "Embarque eliminado"}

@app.put("/api/pagos")
def toggle_pago(data: PagoToggle):
    fecha_pago = datetime.utcnow().isoformat() if data.pagado else None

    if data.tipo == "DESCARGA":
        for d in DESCARGAS_DB:
            if d.id == data.operacion_id:
                for t in d.trabajadores:
                    if t.trabajador_id == data.trabajador_id:
                        t.pagado = data.pagado
                        t.fecha_pago = fecha_pago
                        return {"success": True, "updated": t}
    elif data.tipo == "EMBARQUE":
        for e in EMBARQUES_DB:
            if e.id == data.operacion_id:
                for t in e.trabajadores:
                    if t.trabajador_id == data.trabajador_id:
                        t.pagado = data.pagado
                        t.fecha_pago = fecha_pago
                        return {"success": True, "updated": t}

    return {"success": False, "message": "No encontrado"}

@app.get("/api/reportes")
def get_reportes(
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    trabajador_id: Optional[str] = None,
    estado_pago: str = "todos"
):
    movimientos = []
    total_generado = 0
    total_pagado = 0
    total_pendiente = 0

    # Descargas
    for d in DESCARGAS_DB:
        if fecha_inicio and d.fecha < fecha_inicio: continue
        if fecha_fin and d.fecha > fecha_fin: continue
        for t in d.trabajadores:
            if trabajador_id and t.trabajador_id != trabajador_id: continue
            if estado_pago == "pagado" and not t.pagado: continue
            if estado_pago == "pendiente" and t.pagado: continue

            total_generado += t.monto_individual
            if t.pagado: total_pagado += t.monto_individual
            else: total_pendiente += t.monto_individual

            movimientos.append({
                "fecha": d.fecha,
                "tipo": "DESCARGA",
                "descripcion": f"{d.cantidad_carros} Carro(s) de {d.filas_por_carro} filas",
                "trabajador": t.trabajador_nombre,
                "monto": t.monto_individual,
                "pagado": t.pagado
            })

    # Embarques
    for e in EMBARQUES_DB:
        if fecha_inicio and e.fecha < fecha_inicio: continue
        if fecha_fin and e.fecha > fecha_fin: continue
        for t in e.trabajadores:
            if trabajador_id and t.trabajador_id != trabajador_id: continue
            if estado_pago == "pagado" and not t.pagado: continue
            if estado_pago == "pendiente" and t.pagado: continue

            total_generado += t.monto_individual
            if t.pagado: total_pagado += t.monto_individual
            else: total_pendiente += t.monto_individual

            movimientos.append({
                "fecha": e.fecha,
                "tipo": "EMBARQUE",
                "descripcion": f"{e.cantidad_trailers} Tráiler(s)",
                "trabajador": t.trabajador_nombre,
                "monto": t.monto_individual,
                "pagado": t.pagado
            })

    movimientos.sort(key=lambda x: x["fecha"], reverse=True)
    return {
        "resumen": {
            "total_generado": round(total_generado, 2),
            "total_pagado": round(total_pagado, 2),
            "total_pendiente": round(total_pendiente, 2),
            "cantidad": len(movimientos)
        },
        "movimientos": movimientos
    }

@app.post("/api/reiniciar-cuentas")
def reiniciar_cuentas():
    DESCARGAS_DB.clear()
    EMBARQUES_DB.clear()
    return {"mensaje": "Cuentas reiniciadas a $0 exitosamente"}
