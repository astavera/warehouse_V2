# Guía: Iniciar el proyecto en otro computador

Pasos para clonar y correr **warehouse_V2** en un equipo nuevo, y mantener todo sincronizado.

## 1. Requisitos (instalar una sola vez)

- **Git** → https://git-scm.com/download/win
- **Node.js** (versión 20 o 22 LTS) → https://nodejs.org

Verifica en PowerShell:

```powershell
git --version
node --version
npm --version
```

## 2. Clonar el repo y entrar a la rama de trabajo

```powershell
cd C:\Users\TU_USUARIO\Downloads
git clone https://github.com/astavera/warehouse_V2.git
cd warehouse_V2
git checkout feature/square-prices
```

> GitHub te pedirá iniciar sesión / autorizar. Usa la cuenta con acceso al repo `astavera`.

## 3. Instalar dependencias

```powershell
npm install
```

## 4. Crear el archivo `.env`

Este archivo **NO viene en el repo** (está protegido por `.gitignore`, así debe ser).
Créalo a mano en la raíz del proyecto, usando `.env.example` como plantilla y
pegando las credenciales reales del proyecto.

> ⚠️ Las credenciales reales **nunca** se suben a GitHub. Pídelas por un canal
> seguro (no por el repo) o cópialas desde el `.env` del computador principal.

## 5. Arrancar la app

```powershell
npm run dev
```

Se abre en el navegador, normalmente en `http://localhost:5173` o `http://localhost:8080`.

---

## Flujo de trabajo entre los dos computadores

Para no volver a quedar con "la versión vieja":

| Cuándo | Comando |
|---|---|
| **Antes de empezar** a trabajar (en cualquier PC) | `git pull` |
| **Al terminar** de trabajar | `git add .` → `git commit -m "lo que hiciste"` → `git push` |

**Regla de oro:** siempre `git pull` al empezar y `git push` al terminar.
Así ambos equipos quedan iguales.

---

## Notas

- Rama de trabajo actual: `feature/square-prices`
- Rama de producción (la que despliega Vercel): `main`
- Repo en GitHub: https://github.com/astavera/warehouse_V2
