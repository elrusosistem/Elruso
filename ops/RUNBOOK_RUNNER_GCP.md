# Runner 24/7 en GCP Compute Engine

Manual para instalar y operar el runner de Elruso en una VM de Google Cloud.

---

## 1. Crear la VM en GCP

1. Ir a **Compute Engine > VM instances > Create Instance**
2. Configuracion recomendada:

| Campo | Valor |
|-------|-------|
| Nombre | `elruso-runner` |
| Region | `us-east1` (cerca de Supabase/Render) |
| Tipo de maquina | `e2-small` (2 vCPU, 2 GB RAM) |
| Sistema operativo | Ubuntu 22.04 LTS |
| Disco | 20 GB SSD (default) |
| Firewall | NO necesita puertos abiertos (solo sale trafico) |

3. Click **Create**
4. Cuando la VM este lista, conectar via SSH:
   - Desde la consola GCP: click **SSH** en la lista de VMs
   - O desde terminal local: `gcloud compute ssh elruso-runner`

---

## 2. Instalacion (1 comando)

Una vez conectado a la VM por SSH:

```bash
# 1. Clonar el repo
git clone https://github.com/elrusosistem/Elruso.git ~/Elruso

# 2. Ejecutar instalador
sudo bash ~/Elruso/scripts/gcp_runner_install.sh
```

Esto automaticamente:
- Instala Node 22, pnpm, git, jq, curl
- Instala dependencias del proyecto
- Crea archivo de configuracion (`ops/.secrets/runner.env`)
- Instala y arranca servicio systemd
- Habilita auto-start en boot

**Resultado esperado**: El script termina mostrando el status del servicio como `active (running)`.

---

## 3. Verificar desde el Panel

Abrir **https://elruso.vercel.app** en el navegador:

### Checklist

- [ ] **#/runners**: Aparece un runner con status **online** y hostname de la VM
- [ ] **Navbar**: El indicador dice **Sistema ACTIVO** (no pausado)
- [ ] **#/tasks**: Si hay tasks READY, el runner las va procesando

### Test de Pause/Resume

1. En el panel, click en **Sistema ACTIVO** (navbar) para pausar
2. Verificar que el indicador cambie a **Sistema PAUSADO**
3. El runner sigue corriendo pero NO puede claim tasks (recibe 423)
4. Click de nuevo para reanudar
5. Verificar que el runner vuelve a procesar tasks

---

## 4. Comandos de operacion

Desde la VM por SSH:

### Con el wrapper (recomendado)

```bash
# Ver estado
./Elruso/scripts/gcp_runner_ctl.sh status

# Ver logs (ultimas 200 lineas)
./Elruso/scripts/gcp_runner_ctl.sh logs

# Logs en tiempo real
./Elruso/scripts/gcp_runner_ctl.sh logs-follow

# Parar
./Elruso/scripts/gcp_runner_ctl.sh stop

# Arrancar
./Elruso/scripts/gcp_runner_ctl.sh start

# Reiniciar
./Elruso/scripts/gcp_runner_ctl.sh restart

# Actualizar codigo y reiniciar
./Elruso/scripts/gcp_runner_ctl.sh update
```

### Con systemctl directo

```bash
sudo systemctl status elruso-runner
sudo systemctl stop elruso-runner
sudo systemctl start elruso-runner
sudo systemctl restart elruso-runner
sudo journalctl -u elruso-runner -f
```

---

## 5. Test de reboot

Verificar que el runner vuelve solo despues de un reinicio de la VM:

```bash
# Desde la VM
sudo reboot
```

Esperar ~1 minuto, luego verificar desde el **panel #/runners** que el runner vuelve a aparecer como **online**.

Si usas gcloud:
```bash
# Reiniciar desde tu maquina local
gcloud compute instances reset elruso-runner --zone=us-east1-b
```

---

## 6. Actualizar el runner

Cuando hay cambios en el repo que afectan al runner:

```bash
# Opcion 1: wrapper
./Elruso/scripts/gcp_runner_ctl.sh update

# Opcion 2: manual
cd ~/Elruso
git pull --ff-only
pnpm install --frozen-lockfile
sudo systemctl restart elruso-runner
```

---

## 7. Troubleshooting

### Runner no aparece online en el panel

1. Verificar que el servicio esta corriendo:
   ```bash
   sudo systemctl status elruso-runner
   ```

2. Si dice `inactive` o `failed`, ver logs:
   ```bash
   sudo journalctl -u elruso-runner -n 50 --no-pager
   ```

3. Errores comunes:
   - **"jq es requerido"**: Correr `sudo apt install -y jq`
   - **"API no respondio"**: Verificar que `API_BASE_URL` en `ops/.secrets/runner.env` es correcto
   - **"system_paused"**: El sistema esta pausado desde el panel — reanudar desde #/runners

4. Verificar conectividad:
   ```bash
   curl -s https://elruso.onrender.com/health | jq .
   ```

### Runner se cae y no vuelve

El servicio systemd tiene `Restart=always` con `RestartSec=5`. Si se cae, vuelve en 5 segundos.

Si systemd mismo deja de reiniciarlo (crash loop), verificar:
```bash
sudo systemctl reset-failed elruso-runner
sudo systemctl start elruso-runner
```

### Cambiar la URL de la API

```bash
# Editar el archivo de env
nano ~/Elruso/ops/.secrets/runner.env

# Reiniciar para que tome el cambio
sudo systemctl restart elruso-runner
```

### Ver consumo de recursos

```bash
# Memoria y CPU del servicio
systemctl status elruso-runner | grep Memory
top -p $(pgrep -f runner_local)
```

---

## 8. Arquitectura

```
┌─────────────────────┐
│  GCP VM (e2-small)  │
│                     │
│  systemd service    │
│  └─ runner_local.sh │
│     └─ --loop       │
│        ├─ heartbeat │──── POST /ops/runner/heartbeat ───► Render API
│        ├─ poll      │──── GET /ops/tasks?status=ready ──► Render API
│        ├─ claim     │──── POST /ops/tasks/claim ────────► Render API
│        └─ run       │──── POST /runs + steps ───────────► Render API
│                     │
└─────────────────────┘
         │
         │ heartbeat cada 15s
         ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Panel (Vercel)     │     │  DB (Supabase)      │
│  #/runners: online  │◄────│  runner_heartbeats   │
│  #/tasks: running   │     │  ops_tasks           │
│  Pause/Resume       │     │  run_logs            │
└─────────────────────┘     └─────────────────────┘
```

---

## 9. Costos estimados

| Recurso | Costo mensual (aprox) |
|---------|-----------------------|
| e2-small (24/7) | ~$13 USD |
| Disco 20GB SSD | ~$2 USD |
| Trafico saliente | < $1 USD |
| **Total** | **~$16 USD/mes** |

Se puede reducir a ~$5/mes con `e2-micro` (0.25 vCPU, 1 GB RAM) si el runner no necesita mucho CPU.

---

## 10. Resumen rapido

| Accion | Comando |
|--------|---------|
| Instalar | `sudo bash ~/Elruso/scripts/gcp_runner_install.sh` |
| Estado | `./Elruso/scripts/gcp_runner_ctl.sh status` |
| Logs | `./Elruso/scripts/gcp_runner_ctl.sh logs` |
| Parar | `./Elruso/scripts/gcp_runner_ctl.sh stop` |
| Arrancar | `./Elruso/scripts/gcp_runner_ctl.sh start` |
| Actualizar | `./Elruso/scripts/gcp_runner_ctl.sh update` |
| Verificar panel | https://elruso.vercel.app/#/runners |
