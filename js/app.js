import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, addDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Global Scroll Helper para el Visor (Accesible desde onclick inline)
window.scrollToEval = function () {
    window.toggleEvalSidebar();
};

window.toggleEvalSidebar = function () {
    const sidebar = document.getElementById('visor-eval-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
};

// Estados
const ESTADO_NO_ENTREGADA = 'No Entregada';
const ESTADO_LISTA = 'Entregada - Lista';
const ESTADO_FALTA_REVISION = 'Entregada - Falta Revisión';

// Estado global de la App
const state = {
    user: null,
    dbDocentes: [],
    dbMaterias: [],
    dfBase: [], // Datos cruzados
    dfMostrado: [], // Datos filtrados
    evaluaciones: {}, // Cache de evaluaciones { materiaId: data }
    vistaActual: 'materias',
    sortConfig: {
        materias: { field: 'Materia', dir: 'asc' },
        docentes: { field: 'Docente', dir: 'asc' }
    }
};

// --- DEFINICIÓN DE RÚBRICAS ---
const RUBRICAS = {
    propuesta: {
        titulo: "Propuesta Académica",
        items: [
            { 
                id: 'hilos', 
                label: 'Hilos Conductores y Metas', 
                desc: '¿Hay una dirección clara para todo el año?',
                niveles: {
                    4: "Los hilos conductores son desafiantes y las metas de comprensión están redactadas desde el desempeño del alumno.",
                    3: "Las metas son claras y están alineadas con los contenidos mínimos de la materia.",
                    2: "Las metas son solo una lista de temas a 'dar', no hay visión de comprensión profunda.",
                    1: "No se definen hilos conductores o son incoherentes con el año."
                }
            },
            { 
                id: 'competencias', 
                label: 'Integración de Competencias', 
                desc: '¿Se planifica el desarrollo de habilidades blandas?',
                niveles: {
                    4: "Integra competencias socioemocionales de forma explícita en las actividades (ej: trabajo en equipo en taller).",
                    3: "Menciona competencias académicas y socioemocionales pertinentes al área técnica.",
                    2: "Enumera competencias pero no explica cómo se trabajarán o evaluarán en el aula.",
                    1: "No contempla competencias; solo se enfoca en el contenido técnico."
                }
            }
        ]
    },
    pedagogica: {
        titulo: "Hoja de Ruta y Metodología",
        items: [
            { 
                id: 'abp', 
                label: 'Diseño del ABP (Solo si aplica)', 
                desc: '¿El proyecto tiene sentido real?',
                niveles: {
                    4: "La pregunta disparadora es auténtica, vinculada a la industria o comunidad, con criterios de evaluación específicos para el proyecto.",
                    3: "Propone un problema o pregunta que articula los contenidos de la unidad.",
                    2: "La propuesta no respeta la metodología de ABP o carece de alguna de sus partes.",
                    1: "El ABP parece un trabajo práctico tradicional con otro nombre; falta el componente de indagación."
                }
            },
            { 
                id: 'evidencia', 
                label: 'Evidencia Integradora', 
                desc: '¿Cómo demuestra el alumno lo aprendido?',
                niveles: {
                    4: "Propone evidencias finales que muestran desempeño profesional que integra múltiples saberes y áreas.",
                    3: "Define una entrega clara que permite verificar el logro de los objetivos principales.",
                    2: "La evidencia es solo un examen escrito o un informe sin aplicación práctica.",
                    1: "No se define una evidencia integradora clara."
                }
            },
            { 
                id: 'criterios', 
                label: 'Criterios y Promoción', 
                desc: '¿Es transparente el sistema de acreditación?',
                niveles: {
                    4: "Detalla requisitos mínimos, evidencias esperadas y cómo se recuperan los saberes no alcanzados.",
                    3: "Establece con claridad qué debe hacer el alumno para promocionar la materia.",
                    2: "Los criterios son subjetivos o no están vinculados a las evidencias mínimas.",
                    1: "No se especifican las condiciones de promoción."
                }
            }
        ]
    },
    seguridad: {
        titulo: "Seguridad y 5S",
        items: [
            { 
                id: 'cultura', 
                label: 'Cultura de Seguridad', 
                desc: '¿La seguridad es parte de la enseñanza?',
                niveles: {
                    4: "La seguridad está integrada en cada actividad pedagógica.",
                    3: "Se mencionan y respetan las normas de seguridad específicas del área.",
                    2: "Las normas de seguridad son genéricas y no se aplican al contexto real de la materia.",
                    1: "No se mencionan normas de seguridad."
                }
            },
            { 
                id: '5s', 
                label: 'Implementación de 5S', 
                desc: '¿Se contempla el trabajo de 5S?',
                niveles: {
                    4: "Se planifican implementación y contenidos relacionados con 5S de forma sistemática e integrada.",
                    3: "Se planifica momentos de orden al final de la clase.",
                    2: "Se planifican momentos aleatorios de implementacion de 5S.",
                    1: "No hay evidencia de planificación de 5S."
                }
            }
        ]
    },
    recursos_gestion: {
        titulo: "Recursos didácticos y gestión del Tiempos",
        items: [
            { 
                id: 'cronograma', 
                label: 'Planificación Temporal', 
                desc: '¿El cronograma es viable?',
                niveles: {
                    4: "El cronograma es detallado, realista.",
                    3: "Existe una planificación temporal básica.",
                    2: "El cronograma no es realista o poco aplicable.",
                    1: "No hay planificación temporal definida."
                }
            },
            { 
                id: 'gestion', 
                label: 'Gestión de la planificación', 
                desc: '¿Entrega en tiempo y forma?',
                niveles: {
                    4: "Entregó antes de la fecha prevista",
                    3: "Entregó a tiempo.",
                    2: "Entregó algunos días despues luego del reclamo.",
                    1: "Entregó varios días luego de varios reclamos."
                }
            }
        ]
    }
};

// Mapeo de usuarios a emails (basado en lo que me comentaste)
const userEmails = {
    "Isi": "ipavelek@gmail.com",
    "Ale": "atombesi@etrr.edu.ar", // Cambiar por el real
    "Luis": "lcornaglia@etrr.edu.ar" // Cambiar por el real
};

// Utilidades
function eliminarAcentos(s) {
    if (!s) return "";
    return s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarNombre(nombre) {
    if (!nombre) return "";
    let n = eliminarAcentos(nombre).toLowerCase().replace(/,/g, " ");
    let palabras = n.split(" ").map(p => p.trim()).filter(p => p);
    palabras.sort();
    return palabras.join(" ");
}

// Variables de UI
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const btnLogin = document.getElementById('btn-login');
const userSelect = document.getElementById('user-select');
const userPassword = document.getElementById('user-password');
const loginError = document.getElementById('login-error');

// Permitir iniciar sesión presionando Enter en el campo de contraseña
userPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        btnLogin.click();
    }
});

// Iniciar Sesión con Firebase Auth
btnLogin.addEventListener('click', async () => {
    // Detectar si se está abriendo como archivo local (CORS blocks modules)
    if (window.location.protocol === 'file:') {
        alert("⚠️ ATENCIÓN: No podés abrir el sistema así.\n\nLos navegadores bloquean la seguridad de Firebase cuando abrís el archivo directamente (doble clic). \n\nPor favor, usá el servidor que te inicié o instalá la extensión 'Live Server' en VS Code.");
        return;
    }

    const user = userSelect.value;
    const email = userEmails[user];
    const pass = userPassword.value;

    if (!pass) return alert("Por favor ingresá tu contraseña.");

    btnLogin.disabled = true;
    btnLogin.textContent = "Validando...";
    loginError.classList.add('hidden');

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        console.error("Error login:", error);
        let msg = "Error: Acceso denegado. Verificá tu contraseña.";
        if (error.code === 'auth/user-not-found') msg = "Error: Usuario no encontrado.";

        loginError.innerHTML = `<strong>Acceso Denegado</strong><br>${msg}`;
        loginError.classList.remove('hidden');
        btnLogin.disabled = false;
        btnLogin.textContent = "Entrar";

        // Efecto de vibración
        loginScreen.querySelector('.login-container').classList.add('shake');
        setTimeout(() => loginScreen.querySelector('.login-container').classList.remove('shake'), 400);
    }
});

// Listener de estado de autenticación
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario logueado
        state.user = user.email;
        loginScreen.classList.remove('active');
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        appScreen.classList.add('active');
        initViewTabs();
        initApp();
    } else {
        // Usuario no logueado
        appScreen.classList.remove('active');
        appScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        loginScreen.classList.add('active');
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
});

// Inicializar Aplicación (Configurar botones y cargar base inicial)
async function initApp() {
    // Botones de Nueva Materia/Docente (EventListener para evitar problemas de Module Scope)
    const btnNewMat = document.getElementById('btn-open-new-materia');
    if (btnNewMat) btnNewMat.onclick = () => window.openModalMateria();

    const btnNewDoc = document.getElementById('btn-open-new-docente');
    if (btnNewDoc) btnNewDoc.onclick = () => window.openModalDocente();

    await cargarBaseDeDatos();
}

async function cargarBaseDeDatos() {
    try {
        // Cargar Docentes
        const docQuery = await getDocs(collection(db, "docentes"));
        state.dbDocentes = docQuery.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                Docente: data.Docente || data.nombre || "Docente sin nombre",
                coordinador: data.coordinador || ""
            };
        });

        // Cargar Materias
        const matQuery = await getDocs(collection(db, "materias"));
        state.dbMaterias = matQuery.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                Materia: data.Materia || data.nombre || "Materia sin nombre",
                Docente: data.Docente || "",
                docentes_ids: data.docentes_ids || []
            };
        });

        // Mapear docentes por ID para materias que vengan de la migración SQLite
        const mapDocentes = {};
        const mapCoords = {};
        state.dbDocentes.forEach(d => {
            mapDocentes[d.id] = d.Docente;
            mapCoords[d.Docente] = d.coordinador || "";
        });

        state.dbMaterias.forEach(m => {
            if (!m.Docente && m.docentes_ids.length > 0) {
                m.Docente = m.docentes_ids.map(id => mapDocentes[id] || "ID:" + id).join(" - ");
            }
            const nombres = String(m.Docente).split('-').map(n => n.trim());
            const coordsFound = nombres.map(n => mapCoords[n]).filter(Boolean);
            m.Coordinador = coordsFound.length ? [...new Set(coordsFound)].join(" - ") : "Sin Asignar";
        });

        if (rawExcelData) {
            // Re-ejecutar el cruce si ya hay un Excel cargado
            document.getElementById('btn-process').click();
        } else {
            state.dfBase = state.dbMaterias.map(m => ({
                ...m,
                Estado: "Sin Sincronizar (Cargá el Excel)",
                _isPlaceholder: true
            }));
            state.dfMostrado = [...state.dfBase];
            renderizarVistas();
            actualizarContadoresGlobales();
        }

        // Configurar Opciones Coordinator
        const coords = [...new Set(state.dbDocentes.map(d => d.coordinador).filter(Boolean))];
        const coordSelect = document.getElementById('filter-coord');
        coordSelect.innerHTML = '<option value="Todos">Todos</option><option value="Sin Asignar">Sin Asignar</option>';
        coords.forEach(c => {
            coordSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });

    } catch (e) {
        console.error("Error al cargar BD Firestore:", e);
    }
}

// --- Manejo de Archivos Excel (Manual) ---
let rawExcelData = null;

// Cargar Local
document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        procesarExcelBuffer(evt.target.result);
        alert(`Archivo cargado con éxito: ${file.name}\n\nAhora hacé clic en el botón verde para "Cruzar con Base de Datos".`);
    };
    reader.readAsArrayBuffer(file);
});

function procesarExcelBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    rawExcelData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
}

// Cruzar Datos
document.getElementById('btn-process').addEventListener('click', () => {
    if (!rawExcelData) return alert("Cargue procese el archivo de planificaciones primero (Local o Sincronizado).");
    if (state.dbMaterias.length === 0) return alert("No hay materias en la base de datos de Firebase.");

    try {
        // 1. Preparar Materias Base
        const mapDocentes = {}; // id -> nombre
        state.dbDocentes.forEach(d => { mapDocentes[d.id] = d.Docente; });

        const filasMat = state.dbMaterias.map(m => {
            const docsNames = (m.docentes_ids || []).map(id => mapDocentes[id] || "Desconocido");
            const materiaNombre = m.Materia || m.nombre || "Materia sin nombre";
            return {
                ...m,
                Materia_Base: materiaNombre,
                Materia_Clean: materiaNombre.toLowerCase().trim(),
                Docentes_Asignados: docsNames.length ? docsNames.join(" - ") : "Desconocido"
            };
        });

        // 2. Preparar Planificaciones
        let dfPlan = rawExcelData.map(row => {
            const newRow = { ...row };
            // Encontrar clave materia
            const matKey = Object.keys(newRow).find(k => k.trim().toUpperCase() === 'NOMBRE DE LA MATERIA' || k.trim().toUpperCase() === 'MATERIA');
            newRow.Materia_Plan = matKey ? String(newRow[matKey]).trim().toLowerCase() : null;

            const docKey = Object.keys(newRow).find(k => k.trim().toUpperCase().includes('DOCENTE TITULAR'));
            newRow['DOCENTE TITULAR'] = docKey ? newRow[docKey] : "Desconocido";

            const revKey = Object.keys(newRow).find(k => k.toLowerCase().includes('revisión del coordinador'));
            newRow._col_revision = revKey ? newRow[revKey] : "Desconocido";

            // Normalizar claves para visualización
            Object.keys(newRow).forEach(k => {
                const normK = k.replace(/\n|\r/g, ' ').trim();
                if (normK !== k) {
                    newRow[normK] = newRow[k];
                    delete newRow[k];
                }
            });

            return newRow;
        }).filter(r => r.Materia_Plan);

        // Remover duplicados (quedando con el ultimo ingresado, asumiendo orden de array)
        const mapPlan = {};
        dfPlan.forEach(p => { mapPlan[p.Materia_Plan] = p; });

        // 3. Cruce
        const merged = filasMat.map(baseMat => {
            const plan = mapPlan[baseMat.Materia_Clean] || null;
            const res = { ...baseMat, ...plan, Materia: baseMat.Materia_Base };

            // Estado
            if (!plan) res.Estado = ESTADO_NO_ENTREGADA;
            else {
                const revVal = String(res._col_revision || '').toLowerCase().trim();
                res.Estado = (revVal === 'sí' || revVal === 'si' || revVal === 'yes') ? ESTADO_LISTA : ESTADO_FALTA_REVISION;
            }

            // Docente_Raw
            res.Docente_Raw = res.Estado === ESTADO_NO_ENTREGADA ?
                (res.Docentes_Asignados || "Sin Docente Asignado") :
                (res['DOCENTE TITULAR'] || "Sin Docente");

            // Unificar Docente y obtener Coordinador
            const partes = String(res.Docente_Raw).split('-');
            const coordsFound = [];
            const unificados = partes.map(p => {
                const pNorm = normalizarNombre(p);
                const docOficial = state.dbDocentes.find(d => normalizarNombre(d.Docente) === pNorm);
                if (docOficial && docOficial.coordinador) coordsFound.push(docOficial.coordinador);
                return docOficial ? docOficial.Docente : p.trim();
            });
            res.Docente = unificados.join(" - ");
            res.Coordinador = coordsFound.length ? [...new Set(coordsFound)].join(" - ") : "Sin Asignar";

            // Año y Área para filtros
            const anioKey = Object.keys(res).find(k => k.toUpperCase() === 'AÑO');
            res._Anio = anioKey ? String(res[anioKey]) : null;
            const areaKey = Object.keys(res).find(k => k.toUpperCase() === 'ÁREA');
            res._Area = areaKey ? String(res[areaKey]) : null;

            return res;
        });

        state.dfBase = merged;

        // Populate filter dropdowns
        const anios = [...new Set(merged.map(m => m._Anio).filter(Boolean))].sort();
        const filterAnio = document.getElementById('filter-anio');
        filterAnio.innerHTML = '<option value="Todos">Todos</option>';
        anios.forEach(a => filterAnio.innerHTML += `<option value="${a}">${a}</option>`);

        const areas = [...new Set(merged.map(m => m._Area).filter(Boolean))].sort();
        const filterArea = document.getElementById('filter-area');
        filterArea.innerHTML = '<option value="Todas">Todas</option>';
        areas.forEach(a => filterArea.innerHTML += `<option value="${a}">${a}</option>`);

        aplicarFiltros();
        alert("Datos cruzados y procesados correctamente!");

    } catch (e) {
        console.error("Error cruzando datos:", e);
        alert("Ocurrió un error al procesar los datos: " + e.message);
    }
});

// --- Filtros e UI ---
const chkLista = document.getElementById('chk-lista');
const chkFaltaRev = document.getElementById('chk-faltarev');
const chkNoEntregada = document.getElementById('chk-noentregada');
const searchDocente = document.getElementById('search-docente');
const filterCoord = document.getElementById('filter-coord');
const filterAnio = document.getElementById('filter-anio');
const filterArea = document.getElementById('filter-area');

[chkLista, chkFaltaRev, chkNoEntregada].forEach(el => el.addEventListener('change', aplicarFiltros));
searchDocente.addEventListener('keyup', aplicarFiltros);
[filterCoord, filterAnio, filterArea].forEach(el => el.addEventListener('change', aplicarFiltros));

function aplicarFiltros() {
    if (!state.dfBase.length) return;

    const queryDocente = eliminarAcentos(searchDocente.value.toLowerCase().trim());
    const coordVal = filterCoord.value;
    const anioVal = filterAnio.value;
    const areaVal = filterArea.value;

    const estados = [];
    if (chkLista.checked) estados.push(ESTADO_LISTA);
    if (chkFaltaRev.checked) estados.push(ESTADO_FALTA_REVISION);
    if (chkNoEntregada.checked) estados.push(ESTADO_NO_ENTREGADA);

    state.dfMostrado = state.dfBase.filter(row => {
        if (!estados.includes(row.Estado)) return false;

        if (queryDocente && !eliminarAcentos((row.Docente || "").toLowerCase()).includes(queryDocente)) return false;

        if (anioVal !== 'Todos' && row._Anio !== anioVal) return false;
        if (areaVal !== 'Todas' && row._Area !== areaVal) return false;

        if (coordVal !== 'Todos') {
            if (coordVal === 'Sin Asignar') {
                if (row.Coordinador !== 'Sin Asignar') return false;
            } else {
                if (!String(row.Coordinador).includes(coordVal)) return false;
            }
        }

        return true;
    });

    actualizarContadoresGlobales();
    renderizarVistas();
}

function actualizarContadoresGlobales() {
    let ver = 0, ama = 0, roj = 0;
    state.dfBase.forEach(r => {
        if (r.Estado === ESTADO_LISTA) ver++;
        else if (r.Estado === ESTADO_FALTA_REVISION) ama++;
        else roj++;
    });
    document.getElementById('count-lista').textContent = ver;
    document.getElementById('count-faltarev').textContent = ama;
    document.getElementById('count-noentregada').textContent = roj;
}

// Visualización (Tabs)
document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        state.vistaActual = e.target.dataset.view;

        document.querySelectorAll('.view-panel').forEach(p => {
            p.classList.remove('active');
            p.classList.add('hidden');
        });
        document.getElementById(`view-${state.vistaActual}`).classList.remove('hidden');
        document.getElementById(`view-${state.vistaActual}`).classList.add('active');

        if (state.vistaActual === 'visor') {
            fetchAllEvaluaciones().then(() => renderizarVistas());
        } else {
            renderizarVistas();
        }
    });
});

function renderizarVistas() {
    if (state.vistaActual === 'materias') renderMaterias();
    else if (state.vistaActual === 'docentes') renderDocentes();
    else if (state.vistaActual === 'visor') renderVisorLista();
}

window.sortTable = (view, field) => {
    const conf = state.sortConfig[view];
    if (conf.field === field) {
        conf.dir = conf.dir === 'asc' ? 'desc' : 'asc';
    } else {
        conf.field = field;
        conf.dir = 'asc';
    }
    renderizarVistas();
};

// --- Renderizado de Vistas ---
function renderMaterias() {
    const tbody = document.getElementById('tbody-materias');
    tbody.innerHTML = '';

    // Aplicar ordenamiento
    const conf = state.sortConfig.materias;
    const sorted = [...state.dfMostrado].sort((a, b) => {
        let valA = a[conf.field] || "";
        let valB = b[conf.field] || "";
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return conf.dir === 'asc' ? -1 : 1;
        if (valA > valB) return conf.dir === 'asc' ? 1 : -1;
        return 0;
    });

    sorted.forEach(row => {
        let cls = row.Estado === ESTADO_LISTA ? 'status-lista' : (row.Estado === ESTADO_NO_ENTREGADA ? 'status-noentregada' : 'status-faltarev');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.Materia || row.Materia_Base || ''}</td>
            <td>${row.Docente || ''}</td>
            <td class="${cls}">${row.Estado || ''}</td>
            <td>
                ${row.id ? `
                    <button class="btn-icon" onclick="openModalMateria('${row.id}')" title="Editar">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteMateria('${row.id}')" title="Borrar">🗑️</button>
                ` : '<small style="color:#666">No editable</small>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDocentes() {
    const tbody = document.getElementById('tbody-docentes');
    tbody.innerHTML = '';

    // Agrupar dfMostrado por docente
    const agrupado = {};
    state.dfMostrado.forEach(row => {
        const d = row.Docente || 'Desconocido';
        if (!agrupado[d]) agrupado[d] = { materias: [], ver: 0, ama: 0, roj: 0 };
        agrupado[d].materias.push(row);
        if (row.Estado === ESTADO_LISTA) agrupado[d].ver++;
        else if (row.Estado === ESTADO_NO_ENTREGADA) agrupado[d].roj++;
        else agrupado[d].ama++;
    });

    const conf = state.sortConfig.docentes;
    const sortedKeys = Object.keys(agrupado).sort((a, b) => {
        let valA, valB;
        if (conf.field === 'Docente') {
            valA = a.toLowerCase();
            valB = b.toLowerCase();
        } else {
            valA = agrupado[a][conf.field];
            valB = agrupado[b][conf.field];
        }

        if (valA < valB) return conf.dir === 'asc' ? -1 : 1;
        if (valA > valB) return conf.dir === 'asc' ? 1 : -1;
        return 0;
    });

    sortedKeys.forEach((docName, idx) => {
        const obj = agrupado[docName];
        // Búsqueda difusa para asegurar que aparezcan los íconos si el docente existe en DB
        const normDocName = normalizarNombre(docName);
        const docenteDB = state.dbDocentes.find(d => normalizarNombre(d.Docente) === normDocName);
        const coordinador = docenteDB ? docenteDB.coordinador : "";

        const trDoc = document.createElement('tr');
        trDoc.className = 'docente-row';
        trDoc.style.cursor = 'pointer';
        trDoc.style.backgroundColor = 'rgba(255,255,255,0.03)';
        trDoc.onclick = (e) => {
            // No togglear si clickeó en un botón de acción
            if (e.target.closest('.btn-icon')) return;
            const subRows = document.querySelectorAll(`.subrow-${idx}`);
            const isHidden = subRows[0].classList.contains('hidden');
            subRows.forEach(sr => sr.classList.toggle('hidden'));
            trDoc.querySelector('.toggle-icon').textContent = isHidden ? '▼' : '▶';
        };

        trDoc.innerHTML = `
            <td>
                <span class="toggle-icon" style="display:inline-block; width:20px;">▶</span>
                <strong>📁 ${docName}</strong><br>
                <small style="color:#888; margin-left:25px;">Coord: ${coordinador || 'Sin Asignar'}</small>
            </td>
            <td style="text-align:center">${obj.ver}</td>
            <td style="text-align:center">${obj.ama}</td>
            <td style="text-align:center">${obj.roj}</td>
            <td>
                ${docenteDB ? `
                    <button class="btn-icon" onclick="openModalDocente('${docenteDB.id}')" title="Editar">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteDocente('${docenteDB.id}')" title="Borrar">🗑️</button>
                ` : `
                    <button class="btn-icon" style="opacity:0.8; cursor:pointer;" onclick="openModalDocente(null, '${docName.replace(/'/g, "\\'")}')" title="Docente no encontrado. Click para crear.">⚠️</button>
                `}
            </td>
        `;
        tbody.appendChild(trDoc);

        // Subitems (materias) - Ocultos por defecto
        obj.materias.forEach(m => {
            let cls = m.Estado === ESTADO_LISTA ? 'status-lista' : (m.Estado === ESTADO_NO_ENTREGADA ? 'status-noentregada' : 'status-faltarev');
            const trMat = document.createElement('tr');
            trMat.className = `subrow-${idx} hidden`; // Ocultos por defecto
            trMat.style.fontSize = '12px';
            trMat.innerHTML = `
                <td style="padding-left: 45px; color:#aaa">↳ ${m.Materia}</td>
                <td colspan="3" class="${cls}" style="text-align:center;">${m.Estado}</td>
                <td>
                    ${m.id ? `
                        <button class="btn-icon" style="font-size:12px" onclick="openModalMateria('${m.id}')">✏️</button>
                    ` : ''}
                </td>
            `;
            tbody.appendChild(trMat);
        });
    });
}

// --- Gestión de Modales ---
window.closeModal = (id) => {
    document.getElementById(id).classList.add('hidden');
};

window.openModalMateria = (id = null) => {
    const title = document.getElementById('modal-materia-title');
    const inputId = document.getElementById('edit-materia-id');
    const inputNombre = document.getElementById('input-materia-nombre');
    const selectDocente = document.getElementById('select-materia-docente');

    // Poblar select de docentes
    selectDocente.innerHTML = '<option value="">-- Sin Asignar --</option>';
    state.dbDocentes.sort((a, b) => a.Docente.localeCompare(b.Docente)).forEach(d => {
        selectDocente.innerHTML += `<option value="${d.Docente}">${d.Docente}</option>`;
    });

    if (id) {
        const m = state.dbMaterias.find(mat => mat.id === id);
        title.textContent = "Editar Materia";
        inputId.value = id;
        inputNombre.value = m.Materia || '';
        selectDocente.value = m.Docente || '';
    } else {
        title.textContent = "Nueva Materia";
        inputId.value = "";
        inputNombre.value = "";
        selectDocente.value = "";
    }
    document.getElementById('modal-materia').classList.remove('hidden');
};

window.openModalDocente = (id = null, initialName = "") => {
    const title = document.getElementById('modal-docente-title');
    const inputId = document.getElementById('edit-docente-id');
    const inputNombre = document.getElementById('input-docente-nombre');
    const inputCoord = document.getElementById('input-docente-coordinador');

    if (id) {
        const d = state.dbDocentes.find(doc => doc.id === id);
        title.textContent = "Editar Docente";
        inputId.value = id;
        inputNombre.value = d.Docente || '';
        inputCoord.value = d.coordinador || '';
    } else {
        title.textContent = "Nuevo Docente";
        inputId.value = "";
        inputNombre.value = initialName;
        inputCoord.value = "";
    }
    document.getElementById('modal-docente').classList.remove('hidden');
};

// --- Acciones de Guardar ---
document.getElementById('btn-save-materia').onclick = async () => {
    const id = document.getElementById('edit-materia-id').value;
    const nombre = document.getElementById('input-materia-nombre').value.trim();
    const docente = document.getElementById('select-materia-docente').value;

    if (!nombre) return alert("El nombre es obligatorio.");

    try {
        if (id) {
            await updateDoc(doc(db, "materias", id), { Materia: nombre, Docente: docente });
        } else {
            await addDoc(collection(db, "materias"), { Materia: nombre, Docente: docente, Estado: ESTADO_NO_ENTREGADA });
        }
        closeModal('modal-materia');
        cargarBaseDeDatos(); // Recargar y renderizar
    } catch (err) { alert("Error al guardar: " + err.message); }
};

document.getElementById('btn-save-docente').onclick = async () => {
    const id = document.getElementById('edit-docente-id').value;
    const nombre = document.getElementById('input-docente-nombre').value.trim();
    const coordinador = document.getElementById('input-docente-coordinador').value.trim();

    if (!nombre) return alert("El nombre es obligatorio.");

    try {
        if (id) {
            const docRef = doc(db, "docentes", id);
            const oldDoc = state.dbDocentes.find(d => d.id === id);

            // Si cambió el nombre, actualizarlo también en las materias
            if (oldDoc && oldDoc.Docente !== nombre) {
                const q = query(collection(db, "materias"), where("Docente", "==", oldDoc.Docente));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                    await updateDoc(d.ref, { Docente: nombre });
                }
            }
            await updateDoc(docRef, { Docente: nombre, coordinador: coordinador });
        } else {
            // NUEVO DOCENTE
            const newDoc = await addDoc(collection(db, "docentes"), { Docente: nombre, coordinador: coordinador });

            // Si estamos en medio de un cruce (Excel cargado), vincular automáticamente las materias en Firestore
            if (rawExcelData) {
                const normNuevo = normalizarNombre(nombre);
                for (let m of state.dbMaterias) {
                    if (normalizarNombre(m.Docente) === normNuevo) {
                        await updateDoc(doc(db, "materias", m.id), {
                            Docente: nombre,
                            docentes_ids: [newDoc.id]
                        });
                    }
                }
            }
        }
        closeModal('modal-docente');
        await cargarBaseDeDatos();
    } catch (err) { alert("Error al guardar: " + err.message); }
};

window.deleteMateria = async (id) => {
    if (!confirm("¿Seguro que querés borrar esta materia?")) return;
    try {
        await deleteDoc(doc(db, "materias", id));
        cargarBaseDeDatos();
    } catch (err) { alert("Error al borrar: " + err.message); }
};

window.deleteDocente = async (id) => {
    if (!confirm("¿Seguro que querés borrar este docente? Esto no borrará sus materias, pero quedarán sin asignar.")) return;
    try {
        await deleteDoc(doc(db, "docentes", id));
        cargarBaseDeDatos();
    } catch (err) { alert("Error al borrar: " + err.message); }
};

// Visor
const visorList = document.getElementById('visor-list');
const visorDetail = document.getElementById('visor-detail');

function renderVisorLista() {
    visorList.innerHTML = '';
    state.dfMostrado.forEach((row, i) => {
        let col = "#fff";
        if (row.Estado === ESTADO_LISTA) col = "var(--color-green-light)";
        else if (row.Estado === ESTADO_NO_ENTREGADA) col = "var(--color-red)";
        else col = "var(--color-yellow)";

        // Obtener estado de evaluación (del coordinador actual)
        const evals = state.evaluaciones[row.id] || [];
        const myEval = evals.find(e => e.coord === (state.user || "Coordinador")) || { status: 'Sin Evaluar' };

        let badgeClass = 'sin';
        if (myEval.status === 'En Proceso') badgeClass = 'pro';
        else if (myEval.status === 'Evaluado') badgeClass = 'ok';

        const btn = document.createElement('button');
        btn.className = 'visor-list-btn';
        btn.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="color:${col}; font-weight:bold">•</span> 
                    <span style="color:var(--text-main); font-weight:600;">${row.Materia}</span><br>
                    <small style="color:var(--text-muted)">${row.Docente}</small>
                </div>
                <span class="eval-badge ${badgeClass}">${myEval.status}</span>
            </div>
        `;
        btn.onclick = () => renderDetalleVisor(row);
        visorList.appendChild(btn);
    });
}

function renderDetalleVisor(row) {
    let col = "#fff";
    if (row.Estado === ESTADO_LISTA) col = "var(--color-green-light)";
    else if (row.Estado === ESTADO_NO_ENTREGADA) col = "var(--color-red)";
    else col = "var(--color-yellow)";

    let html = `
        <h2 style="color:var(--color-primary); margin-bottom:5px;">${row.Materia}</h2>
        <h4 style="color:var(--text-muted); margin-bottom:20px;">👤 ${row.Docente}</h4>
        
        <div class="info-card" style="border-left: 4px solid ${col}">
            <div style="color:${col}; font-weight:bold; margin-bottom:10px;">ESTADO: ${row.Estado}</div>
        </div>
    `;

    if (row.Estado === ESTADO_NO_ENTREGADA) {
        html += `<div class="info-card"><p>Esta materia aún no tiene planificación entregada.</p></div>`;
    } else {
        // Renderizar campos principales en grid
        html += `
            <div class="info-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:10px;">
                    <h3 style="margin:0; color:var(--color-primary);">Detalles de Planificación</h3>
                    <div class="no-print" style="display:flex; gap:10px;">
                        <button class="btn btn-primary" onclick="window.scrollToEval()" style="background:var(--color-primary); border:none; color: #fff; font-weight:700; font-size:12px; padding: 6px 12px; display:flex; align-items:center; gap:5px;">
                            📋 EVALUAR
                        </button>
                        <button class="btn btn-primary" onclick="mostrarResumenIA('${row.id}')" style="background: linear-gradient(90deg, #facc15, #ff8c00); border:none; color: #000; font-weight:700; font-size:12px; padding: 6px 12px; display:flex; align-items:center; gap:5px;">
                            ✨ RESUMEN IA
                        </button>
                    </div>
                </div>
        `;

        const ignoreList = [
            'Materia', 'Materia_Base', 'Materia_Clean', 'Materia_Plan',
            'Docente', 'Docente_Raw', 'Docentes_Asignados', 'Estado',
            '_Anio', '_Area', '_col_revision', '_isplaceholder',
            'id', 'nombre', 'ID', 'Nombre', 'docente_ids', 'docentes_ids', 'coordinador',
            'Hora de inicio', 'Hora de finalización', 'Hora de finalizancion',
            'Correo electrónico', 'Hora de la última modificación', 'Coordinador'
        ];

        let afterRotaciones = false;
        let gridHtml = '';
        let listHtml = '';

        Object.keys(row).forEach(k => {
            const lowerK = k.toLowerCase();
            const shouldIgnore = ignoreList.some(ig => ig.toLowerCase() === lowerK) ||
                lowerK.includes('unnamed') ||
                lowerK.includes('hora');

            if (shouldIgnore) return;
            const val = row[k];
            if (val !== undefined && val !== null && val !== "") {
                const valStr = String(val);
                // Detectar URLs (http/https)
                const urlMatch = valStr.match(/(https?:\/\/[^\s]+)/g);
                let extraHtml = '';
                if (urlMatch) {
                    urlMatch.forEach(url => {
                        // Limpiar URL de posibles signos de puntuación al final
                        const cleanUrl = url.replace(/[.,;)]$/, '');
                        extraHtml += `
                            <a href="${cleanUrl}" target="_blank" class="btn-open-link">
                                🌐 Abrir enlace
                            </a>
                        `;
                    });
                }

                const itemHtml = `
                    <div class="info-item">
                        <div class="info-item-label">${k}</div>
                        <div class="info-item-val">
                            ${valStr.replace(/\n/g, '<br>')}
                            ${extraHtml ? '<div style="display:flex; gap:5px; flex-wrap:wrap;">' + extraHtml + '</div>' : ''}
                        </div>
                    </div>
                `;

                if (afterRotaciones) {
                    listHtml += itemHtml;
                } else {
                    gridHtml += itemHtml;
                }

                if (k.toUpperCase().trim() === "ROTACIONES ANUALES") {
                    afterRotaciones = true;
                }
            }
        });

        html += `<div class="info-grid">${gridHtml}</div>`;
        if (listHtml) {
            html += `<h4 style="margin: 25px 0 10px; color: var(--color-orange); border-bottom: 1px solid #444; padding-bottom: 5px; font-size: 14px; text-transform: uppercase;">Contenido de Planificación</h4>`;
            html += `<div class="info-list" style="display: flex; flex-direction: column; gap: 15px;">${listHtml}</div>`;
        }
        html += `</div>`;
    }

    visorDetail.innerHTML = html;

    // Actualizar sidebar de evaluación (pero no abrirlo solo)
    fetchEvaluacionesMateria(row.id).then(() => {
        const evalHtml = renderPanelEvaluacion(row.id);
        const evalContent = document.getElementById('visor-eval-content');
        if (evalContent) {
            evalContent.innerHTML = evalHtml;
        }
    });
}

// Toggles Sidebar
document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    const isCol = document.getElementById('sidebar').classList.contains('collapsed');
    document.getElementById('btn-toggle-sidebar').textContent = isCol ? '➡ Mostrar Menú Lateral' : '⬅ Ocultar Menú Lateral';
});

document.getElementById('btn-toggle-visor-list').addEventListener('click', () => {
    document.getElementById('visor-sidebar').classList.toggle('collapsed');
    const isCol = document.getElementById('visor-sidebar').classList.contains('collapsed');
    document.getElementById('btn-toggle-visor-list').textContent = isCol ? '➡ Mostrar Lista' : '⬅ Ocultar Lista';
});

// --- FUNCIONES DE RESUMEN IA ---
window.mostrarResumenIA = function (id) {
    // Buscar la fila en los datos cruzados (dfBase)
    const row = state.dfBase.find(r => String(r.id) === String(id));
    if (!row) {
        console.error("No se encontró la materia con ID:", id, "en", state.dfBase);
        alert("No se pudieron cargar los datos para el resumen.");
        return;
    }

    const modal = document.getElementById('modal-ai');
    const content = document.getElementById('modal-ai-content');
    const loading = document.getElementById('ai-loading');

    // Resetear cabecera del modal por si venía de un resumen de evaluación
    modal.querySelector('h2').textContent = "Resumen Inteligente";
    modal.querySelector('.modal-ai-icon').textContent = "✨";

    content.innerHTML = '';
    loading.style.display = 'block';
    modal.classList.remove('hidden');

    // Simular "Pensamiento" de IA para dar efecto premium
    setTimeout(() => {
        loading.style.display = 'none';

        // --- BÚSQUEDA INTELIGENTE DE CAMPOS (Resiliencia mejorada) ---
        const buscarCampo = (regex) => {
            const key = Object.keys(row).find(k => regex.test(k));
            return key ? row[key] : "";
        };

        let fund = buscarCampo(/fundamenta|fund|eje|propuesta/i) || buscarCampo(/introducc/i) || "";
        let obj = buscarCampo(/objetivo|meta|competencia|expectativa/i) || buscarCampo(/capacit/i) || "";
        let evaluacion = buscarCampo(/evalua|criterio|acreditacion/i) || buscarCampo(/exame/i) || "";

        // Fallback: Si no se encuentran campos específicos, buscar los campos de texto más largos
        if (!fund && !obj && !evaluacion) {
            const ignoreList = ['materia', 'docente', 'id', 'id_materia', 'nombre', 'email', 'coordinador'];
            const sortedByLength = Object.entries(row)
                .filter(([k, v]) => !ignoreList.some(ig => k.toLowerCase().includes(ig)) && typeof v === 'string')
                .sort((a, b) => b[1].length - a[1].length);

            if (sortedByLength.length > 0) {
                fund = sortedByLength[0][1];
                if (sortedByLength.length > 1) obj = sortedByLength[1][1];
                if (sortedByLength.length > 2) evaluacion = sortedByLength[2][1];
            }
        }

        // --- AUDITORÍA DE INTEGRIDAD DE DATOS (Detectar campos vacíos o basura) ---
        const auditoria = [];
        const tecnicos = ['id', 'materia', 'docente', 'email', 'coord', 'estado', '_anio', '_area', '_col', '_is'];

        Object.entries(row).forEach(([k, v]) => {
            const lowerK = k.toLowerCase();
            if (tecnicos.some(t => lowerK.includes(t)) || row.Estado === ESTADO_NO_ENTREGADA) return;

            const val = String(v || "").trim();
            if (val === "" || val.length === 0) {
                auditoria.push(`⚠️ <b>"${k}"</b> está vacío.`);
            } else if (val.length < 5 && /[^a-zA-Z0-9\s]/.test(val)) {
                auditoria.push(`❌ <b>"${k}"</b> contiene caracteres de relleno ("${val}").`);
            } else if (["aaa", "...", "prueba", "sin datos"].includes(val.toLowerCase())) {
                auditoria.push(`❌ <b>"${k}"</b> completado con texto genérico.`);
            }
        });

        const auditoriaHtml = auditoria.length > 0
            ? `
            <div style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.2); margin-top: 20px;">
                <h5 style="margin: 0 0 10px; color: #f87171; font-size: 13px; text-transform:uppercase; letter-spacing:1px;">🔍 Alertas de Integridad</h5>
                <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #fca5a5; line-height: 1.4;">
                    ${auditoria.map(a => `<li style="margin-bottom:5px;">${a}</li>`).join('')}
                </ul>
            </div>
            ` : `
            <div style="background: rgba(34, 197, 94, 0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.2); margin-top: 20px; font-size: 12px; color: #86efac; text-align: center;">
                ✨ Estructura de datos validada: Planificación completa.
            </div>
            `;

        let resumenHtml = `
            <div style="background: rgba(250, 204, 21, 0.05); padding: 15px; border-radius: 8px; border-left: 4px solid #facc15; margin-bottom: 20px;">
                <h4 style="margin-top:0; color:#facc15; font-size:14px; text-transform:uppercase;">Eje Pedagógico Fundamental</h4>
                <p style="margin-bottom:0; font-size:14px;">${extraerEsencia(fund, 380)}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color:var(--color-primary); margin-bottom:8px; font-size:14px; text-transform:uppercase;">🎯 Objetivos Clave</h4>
                <ul style="padding-left: 20px; margin:0; font-size:14px;">
                    ${extraerLista(obj, 3)}
                </ul>
            </div>

            <div style="margin-bottom: 10px;">
                <h4 style="color:var(--color-primary); margin-bottom:8px; font-size:14px; text-transform:uppercase;">📊 Metodología de Evaluación</h4>
                <p style="margin-bottom:0; font-size:14px;">${extraerEsencia(evaluacion, 220)}</p>
            </div>

            ${auditoriaHtml}

            <div style="margin-top:30px; padding:12px; border-top:1px dashed #444; font-size:11px; color:var(--text-muted); text-align:center; letter-spacing:1px;">
                INTELIGENCIA ARTIFICIAL APLICADA • PLANIS ENGINE v2.0
            </div>
        `;
        content.innerHTML = resumenHtml;
    }, 1200);
}

function extraerEsencia(texto, max = 250) {
    if (!texto || texto.trim().length === 0) return "El docente no ha detallado este apartado en su planificación.";
    // Limpiar HTML básico si lo hubiera
    const limpio = texto.replace(/<[^>]*>/g, '').trim();
    return limpio.length > max ? limpio.substring(0, max) + "..." : limpio;
}

function extraerLista(texto, maxCount = 3) {
    if (!texto || texto.trim().length === 0) return "<li>Información no disponible para análisis.</li>";
    // Intentar separar por puntos, saltos de línea o bullets
    const bullets = texto.split(/[\n•*-]/).filter(s => s.trim().length > 15);
    if (bullets.length === 0) return `<li>${extraerEsencia(texto, 120)}</li>`;
    return bullets.slice(0, maxCount).map(b => `<li style="margin-bottom:5px;">${b.trim()}</li>`).join('');
}

// Utilidad para inyectar SQLite JSON a Firebase desde console para la migracion inicial
window.importarMigracion = async function (jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        // Docentes
        for (let d of data.docentes) {
            await setDoc(doc(db, "docentes", String(d.id)), {
                Docente: d.nombre, // Cambiado de nombre -> Docente
                email: d.email || "",
                coordinador: d.coordinador || ""
            });
        }
        // Materias
        for (let m of data.materias) {
            await setDoc(doc(db, "materias", String(m.id)), {
                Materia: m.nombre, // Cambiado de nombre -> Materia
                Docente: "", // Se asignará luego
                docentes_ids: (m.docentes_ids || []).map(String)
            });
        }
        // Config
        for (let c of data.config) {
            await setDoc(doc(db, "config", c.clave), { valor: c.valor });
        }
        alert("Migración a Firestore completada con éxito!");
        window.location.reload();
    } catch (err) {
        console.error("Error importando:", err);
        alert("Error: " + err.message);
    }
};

// --- GESTIÓN DE EVALUACIONES (RÚBRICAS) ---
async function fetchAllEvaluaciones() {
    try {
        const snap = await getDocs(collection(db, "evaluaciones"));
        const evals = snap.docs.map(d => d.data());
        // Agrupar por materiaId
        state.evaluaciones = {};
        evals.forEach(e => {
            const mid = e.materiaId;
            if (!state.evaluaciones[mid]) state.evaluaciones[mid] = [];
            state.evaluaciones[mid].push(e);
        });
    } catch (e) { console.error("Error cargando todas las evaluaciones:", e); }
}

async function fetchEvaluacionesMateria(materiaId) {
    try {
        const q = query(collection(db, "evaluaciones"), where("materiaId", "==", String(materiaId)));
        const snap = await getDocs(q);
        state.evaluaciones[materiaId] = snap.docs.map(d => d.data());
        return state.evaluaciones[materiaId];
    } catch (e) {
        console.error("Error al cargar evaluaciones:", e);
        return [];
    }
}

window.cambiarEstadoEvaluacion = async function (materiaId, nuevoEstado) {
    const user = state.user || "Coordinador";
    const docId = `${materiaId}_${user}`;
    try {
        const docRef = doc(db, "evaluaciones", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            await updateDoc(docRef, { status: nuevoEstado, timestamp: new Date() });
        } else {
            await setDoc(docRef, {
                materiaId: String(materiaId),
                coord: user,
                status: nuevoEstado,
                scores: {},
                feedback: "",
                timestamp: new Date()
            });
        }
        await fetchEvaluacionesMateria(materiaId);
        const row = state.dfBase.find(r => String(r.id) === String(materiaId));
        if (row) {
            renderDetalleVisor(row);
            renderVisorLista();
        }
    } catch (e) {
        console.error("Error al cambiar estado:", e);
    }
};

window.guardarPuntajeRubrica = async function (materiaId, rubroId, score) {
    const user = state.user || "Coordinador";
    const docId = `${materiaId}_${user}`;
    try {
        const docRef = doc(db, "evaluaciones", docId);
        const docSnap = await getDoc(docRef);

        const data = docSnap.exists() ? docSnap.data() : {
            materiaId: String(materiaId),
            coord: user,
            status: 'En Proceso',
            scores: {},
            feedback: "",
            timestamp: new Date()
        };

        data.scores[rubroId] = score;
        data.timestamp = new Date();

        await setDoc(docRef, data);
        await fetchEvaluacionesMateria(materiaId);
        const row = state.dfBase.find(r => String(r.id) === String(materiaId));
        if (row) {
            renderDetalleVisor(row);
            renderVisorLista();
        }
    } catch (e) {
        console.error("Error al guardar puntaje:", e);
    }
};

window.guardarComentarioRubrica = async function (materiaId, catId, texto) {
    try {
        const user = state.user || "Coordinador";
        const docRef = doc(db, "evaluaciones", `${materiaId}_${user}`);
        const docSnap = await getDoc(docRef);

        let data = {
            materiaId,
            coord: user,
            status: 'Sin Evaluar',
            scores: {},
            comentarios: {},
            timestamp: new Date()
        };

        if (docSnap.exists()) {
            data = docSnap.data();
            if (!data.comentarios) data.comentarios = {};
        }

        data.comentarios[catId] = texto;
        data.timestamp = new Date();

        await setDoc(docRef, data);
        state.evaluaciones[materiaId] = state.evaluaciones[materiaId] || [];
        // Actualizar cache local si es necesario, aunque fetch lo hace
    } catch (e) {
        console.error("Error al guardar comentario:", e);
    }
};

function renderPanelEvaluacion(materiaId) {
    const evals = state.evaluaciones[materiaId] || [];
    const myEval = evals.find(e => e.coord === (state.user || "Coordinador")) || { status: 'Sin Evaluar', scores: {}, comentarios: {} };
    if (!myEval.comentarios) myEval.comentarios = {};

    let html = `
        <div style="margin-bottom:25px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:var(--color-primary); font-size:16px;">🔍 Auditoría</h3>
                <button class="btn-icon" onclick="toggleEvalSidebar()" title="Cerrar panel">✖</button>
            </div>
            
            <div class="status-selector" style="background:#222; padding:4px; border-radius:8px; margin-bottom:20px;">
                <button class="status-btn ${myEval.status === 'Sin Evaluar' ? 'active' : ''}" style="flex:1" onclick="cambiarEstadoEvaluacion('${materiaId}', 'Sin Evaluar')">Pendiente</button>
                <button class="status-btn env ${myEval.status === 'En Proceso' ? 'active' : ''}" style="flex:1" onclick="cambiarEstadoEvaluacion('${materiaId}', 'En Proceso')">Proceso</button>
                <button class="status-btn ok ${myEval.status === 'Evaluado' ? 'active' : ''}" style="flex:1" onclick="cambiarEstadoEvaluacion('${materiaId}', 'Evaluado')">List@</button>
            </div>
        </div>
    `;

    Object.entries(RUBRICAS).forEach(([catId, cat]) => {
        html += `
            <div class="eval-section-card">
                <div class="eval-section-title">${cat.titulo}</div>
        `;

        cat.items.forEach(item => {
            const currentScore = myEval.scores[item.id] || 0;
            html += `
                <div class="eval-item-row">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span class="eval-item-label" style="margin:0;">
                            ${item.label}
                            <button class="btn-help" onclick="abrirModalRubrica('${item.id}', '${materiaId}')" title="Ver rúbrica detallada">?</button>
                        </span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${[1, 2, 3, 4].map(s => `
                            <button class="score-btn ${currentScore === s ? 'active' : ''}" 
                                onclick="guardarPuntajeRubrica('${materiaId}', '${item.id}', ${currentScore === s ? 0 : s})"
                                title="${currentScore === s ? 'Quitar calificación' : 'Calificar con ' + s}">
                                ${s}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        const comentario = myEval.comentarios[catId] || "";
        html += `
            <textarea class="eval-comment-box" 
                placeholder="Observaciones de ${cat.titulo.toLowerCase()}..."
                onchange="guardarComentarioRubrica('${materiaId}', '${catId}', this.value)">${comentario}</textarea>
        </div>`;
    });

    if (evals.length > 0) {
        html += `
            <div style="margin-top:20px; padding:15px; background:rgba(250, 140, 0, 0.05); border:1px solid rgba(250, 140, 0, 0.2); border-radius:8px;">
                <button class="btn btn-orange" onclick="generarResumenDocente('${materiaId}')" style="margin:0;">
                    📋 Devolución Docente
                </button>
            </div>
        `;
    }

    return html;
}

window.abrirModalRubrica = function(itemId, materiaId) {
    let item = null;
    Object.values(RUBRICAS).forEach(cat => {
        const found = cat.items.find(i => i.id === itemId);
        if (found) item = found;
    });

    if (!item || !item.niveles) return;

    const modal = document.getElementById('modal-rubrica');
    const title = document.getElementById('modal-rubrica-title');
    const content = document.getElementById('modal-rubrica-content');

    title.textContent = item.label;
    
    let html = `
        <p style="color:var(--text-muted); margin-bottom:20px; font-style:italic; font-size: 14px;">${item.desc}</p>
        <div class="rubrica-table">
            <div class="rubrica-row header">
                <div class="rubrica-col score">NIVEL</div>
                <div class="rubrica-col desc">DESCRIPTOR DE DESEMPEÑO</div>
            </div>
    `;

    [4, 3, 2, 1].forEach(n => {
        const labelText = ["-", "Insuficiente", "En Proceso", "Logrado", "Destacado"][n];
        const statusClass = n >= 3 ? 'ok' : (n === 2 ? 'pro' : 'sin');
        html += `
            <div class="rubrica-row clickable" onclick="seleccionarPuntajeDesdeModal('${materiaId}', '${item.id}', ${n})">
                <div class="rubrica-col score">
                    <span class="score-badge ${statusClass}">${n}</span>
                    <small style="display:block; font-size:9px; margin-top:4px; font-weight:700; opacity:0.7;">${labelText.toUpperCase()}</small>
                </div>
                <div class="rubrica-col desc">${item.niveles[n]}</div>
            </div>
        `;
    });

    html += `</div>`;
    html += `<p style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:15px; opacity:0.6;">💡 Hacé clic en una fila para asignar el puntaje directamente.</p>`;
    content.innerHTML = html;
    modal.classList.remove('hidden');
};

window.seleccionarPuntajeDesdeModal = async function(materiaId, itemId, score) {
    await window.guardarPuntajeRubrica(materiaId, itemId, score);
    window.closeModal('modal-rubrica');
};

window.generarResumenDocente = function (materiaId) {
    const evals = state.evaluaciones[materiaId] || [];
    if (evals.length === 0) return alert("Aún no hay evaluaciones cargadas para esta materia.");

    // Consolidar notas (promedio de todos los coordinadores que evaluaron ese item)
    const scores = {};
    const itemsCount = {};

    evals.forEach(ev => {
        Object.entries(ev.scores).forEach(([id, val]) => {
            scores[id] = (scores[id] || 0) + val;
            itemsCount[id] = (itemsCount[id] || 0) + 1;
        });
    });

    const getScore = (id) => (itemsCount[id] ? Math.round(scores[id] / itemsCount[id]) : 0);
    const getLevel = (s) => ["-", "Insuficiente", "En Proceso", "Logrado", "Destacado"][s] || "-";

    const sections = [
        { label: "1. PROPUESTA", items: ["Hilos Conductores y Metas"], score: getScore('hilos') },
        { label: "2. ACADÉMICA", items: ["Competencias y Gestión"], score: getScore('competencias') || getScore('gestion') },
        { label: "3. METODOLOGÍA", items: ["Diseño ABP y Evidencia"], score: getScore('abp') || getScore('evidencia') },
        { label: "4. EVALUACIÓN", items: ["Criterios y Promoción"], score: getScore('criterios') },
        { label: "5. ENTORNO", items: ["Seguridad y 5S"], score: getScore('cultura') || getScore('5s') }
    ];

    let html = `
        <div style="padding:10px;">
            <p style="color:#aaa; font-size:13px; margin-bottom:20px;">Resumen consolidado basado en las evaluaciones de: ${evals.map(e => e.coord).join(', ')}</p>
            
            <div style="display:flex; flex-wrap:wrap; gap:20px; margin-bottom:30px; align-items:center; justify-content:center;">
                <!-- Gráfico de Radar SVG -->
                <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; border:1px solid #333;">
                    ${generarRadarSVG(sections)}
                </div>
                
                <!-- Feedback "IA" narrativo -->
                <div style="flex:1; min-width:280px; background:rgba(31, 83, 141, 0.05); padding:15px; border-radius:12px; border:1px solid rgba(31, 83, 141, 0.2); position:relative;">
                    <div style="position:absolute; top:-10px; right:15px; background:var(--color-primary); color:white; font-size:9px; font-weight:900; padding:2px 8px; border-radius:10px; text-transform:uppercase; letter-spacing:1px;">IA Audit</div>
                    <h4 style="margin:0 0 10px; color:var(--color-primary); font-size:14px;">🎯 Observaciones Clave</h4>
                    <div style="font-size:12px; color:#ccc; line-height:1.6;">
                        ${generarFeedbackIA(evals, materiaId)}
                    </div>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; color:#eee; font-size:14px;">
                <thead>
                    <tr style="border-bottom:2px solid #444;">
                        <th style="padding:10px; text-align:left;">SECCIÓN / ÍTEM CRÍTICO</th>
                        <th style="padding:10px; text-align:center;">ESTADO (1-4)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sections.forEach(sec => {
        const col = sec.score >= 3 ? 'var(--color-green-light)' : (sec.score === 2 ? 'var(--color-yellow)' : 'var(--color-red)');
        html += `
            <tr style="border-bottom:1px solid #333;">
                <td style="padding:12px 10px;">
                    <b style="color:var(--color-primary);">${sec.label}</b><br>
                    <small style="color:#777;">${sec.items.join(', ')}</small>
                </td>
                <td style="padding:12px 10px; text-align:center;">
                    <span style="background:${col}; color:#000; padding:2px 8px; border-radius:4px; font-weight:800; font-size:12px;">
                        ${sec.score > 0 ? sec.score : '-'}
                    </span><br>
                    <small style="color:${col}; font-size:10px;">${getLevel(sec.score)}</small>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;

    // Nueva Sección: Leyenda de Composición (At pedido del usuario)
    html += `
        <div class="summary-legend" style="margin-top:25px; padding-top:15px; border-top:1px dashed #444;">
            <h5 style="color:var(--color-primary); margin:0 0 10px; font-size:12px; text-transform:uppercase; letter-spacing:1px;">🔍 ¿Cómo se compone este resumen?</h5>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:11px; color:#999;">
                <div><b>1. PROPUESTA:</b> Hilos Conductores y Metas.</div>
                <div><b>2. ACADÉMICA:</b> Integración de Competencias y Gestión.</div>
                <div><b>3. METODOLOGÍA:</b> Diseño del ABP y Evidencia Integradora.</div>
                <div><b>4. EVALUACIÓN:</b> Criterios y Promoción.</div>
                <div style="grid-column: span 2;"><b>5. ENTORNO:</b> Cultura de Seguridad e Implementación de 5S.</div>
            </div>
        </div>
    </div>`;

    const modal = document.getElementById('modal-ai');
    document.getElementById('modal-ai-content').innerHTML = html;
    // Reutilizamos el modal de IA para el resumen
    modal.querySelector('h2').textContent = "Resumen para el Docente";
    modal.querySelector('.modal-ai-icon').textContent = "📊";
    modal.classList.remove('hidden');
};

/**
 * Genera un gráfico de radar en SVG puro
 */
function generarRadarSVG(sections) {
    const size = 180;
    const center = size / 2;
    const radius = 60;
    const labels = ["PROP", "ACAD", "METO", "EVAL", "ENT"];
    const points = [];
    
    // Calcular coordenadas de cada eje y dato
    sections.forEach((sec, i) => {
        const angle = (Math.PI * 2 * i / sections.length) - Math.PI / 2;
        const val = sec.score > 0 ? sec.score : 0.5; // Mínimo visual
        const x = center + radius * (val / 4) * Math.cos(angle);
        const y = center + radius * (val / 4) * Math.sin(angle);
        points.push(`${x},${y}`);
    });

    // Construcción del SVG
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="max-width:100%;">`;
    
    // Pentágonos de fondo (niveles 1 a 4)
    [1, 2, 3, 4].forEach(level => {
        const polyPoints = sections.map((_, i) => {
            const angle = (Math.PI * 2 * i / sections.length) - Math.PI / 2;
            const x = center + radius * (level / 4) * Math.cos(angle);
            const y = center + radius * (level / 4) * Math.sin(angle);
            return `${x},${y}`;
        }).join(' ');
        svg += `<polygon points="${polyPoints}" fill="none" stroke="#333" stroke-width="0.5" />`;
    });

    // Ejes
    sections.forEach((_, i) => {
        const angle = (Math.PI * 2 * i / sections.length) - Math.PI / 2;
        const xEdge = center + radius * Math.cos(angle);
        const yEdge = center + radius * Math.sin(angle);
        svg += `<line x1="${center}" y1="${center}" x2="${xEdge}" y2="${yEdge}" stroke="#333" stroke-width="1" />`;
        
        // Labels
        const xLabel = center + (radius + 20) * Math.cos(angle);
        const yLabel = center + (radius + 15) * Math.sin(angle);
        svg += `<text x="${xLabel}" y="${yLabel}" text-anchor="middle" fill="#777" style="font-size:9px; font-weight:800;">${labels[i]}</text>`;
    });

    // Área de Datos
    svg += `<polygon points="${points.join(' ')}" fill="rgba(31, 83, 141, 0.4)" stroke="var(--color-primary)" stroke-width="2" />`;
    
    // Puntos
    points.forEach(p => {
        const [x, y] = p.split(',');
        svg += `<circle cx="${x}" cy="${y}" r="3" fill="var(--color-primary)" />`;
    });

    svg += `</svg>`;
    return svg;
}

/**
 * Genera feedback redactado basándose en las rúbricas
 */
function generarFeedbackIA(evals, materiaId) {
    // Consolidar scores por item individual (no por sección)
    const items = {};
    evals.forEach(ev => {
        Object.entries(ev.scores).forEach(([id, val]) => {
            if (!items[id]) items[id] = [];
            items[id].push(val);
        });
    });

    const getAvg = (id) => {
        const vals = items[id] || [];
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };

    let fortalezas = [];
    let mejoras = [];

    // Recorrer todos los ítems de todas las categorías
    Object.values(RUBRICAS).forEach(cat => {
        cat.items.forEach(item => {
            const score = getAvg(item.id);
            if (score >= 3) {
                fortalezas.push(`✅ <b>${item.label}:</b> ${item.niveles[score]}`);
            } else if (score > 0) {
                mejoras.push(`💡 <b>${item.label}:</b> Se recomienda trabajar hacia el nivel destacado: <i>"${item.niveles[4]}"</i>`);
            }
        });
    });

    let res = "";
    if (fortalezas.length > 0) {
        res += `<div style="margin-bottom:12px;">${fortalezas.slice(0, 2).join('<br>')}</div>`;
    }
    if (mejoras.length > 0) {
        res += `<div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;"><b>Sugerencias de mejora:</b><br>${mejoras.slice(0, 2).join('<br>')}</div>`;
    } else if (fortalezas.length === 0) {
        res = "Aún no hay suficientes datos cargados para generar un feedback integral.";
    } else {
        res += `<div style="color:var(--color-green-light); font-weight:700;">✨ ¡La planificación cumple con los estándares de excelencia!</div>`;
    }

    return res;
}

/**
 * Analíticas Globales: Estadísticas de toda la institución
 */
window.renderAnaliticasAuditoria = function() {
    const materias = state.dfBase || [];
    const evalsPorMateria = state.evaluaciones || {};
    
    let totalAuditorias = 0;
    const globalScores = { hilos: [], competencias: [], abp: [], evidencia: [], criterios: [], cultura: [], '5s': [], cronograma: [] };
    
    Object.entries(evalsPorMateria).forEach(([mId, evs]) => {
        if (evs.length > 0) {
            totalAuditorias++;
            evs.forEach(ev => {
                Object.entries(ev.scores).forEach(([itemId, val]) => {
                    if (val > 0) globalScores[itemId].push(val);
                });
            });
        }
    });

    const getAvg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "0.0";

    const metrics = [
        { label: "Cobertura de Auditoría", val: `${Math.round((totalAuditorias / materias.length) * 100) || 0}%`, sub: `${totalAuditorias} de ${materias.length} materias` },
        { label: "Promedio Gestión (A)", val: getAvg([...globalScores.hilos, ...globalScores.cronograma]), sub: "Hilos, Metas y Tiempos" },
        { label: "Promedio Pedagógico (C)", val: getAvg([...globalScores.abp, ...globalScores.evidencia]), sub: "ABP y Evidencias" },
        { label: "Promedio Seguridad (E)", val: getAvg([...globalScores.cultura, ...globalScores['5s']]), sub: "Cultura y 5S" }
    ];

    let metricsHtml = metrics.map(m => `
        <div class="info-item" style="border-left-color: var(--color-primary); background: rgba(31, 83, 141, 0.05);">
            <div class="info-item-label">${m.label}</div>
            <div class="info-item-val" style="font-size: 24px; font-weight: 800; color: #fff;">${m.val}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${m.sub}</div>
        </div>
    `).join('');

    document.getElementById('analiticas-metrics').innerHTML = metricsHtml;

    // --- ESTADÍSTICAS DE ABP ---
    let aplicaABP = [];
    let noAplicaABP = [];
    let sinDatoABP = [];

    materias.forEach(m => {
        if (m.Estado === 'No Entregada') return;
        const abpKey = Object.keys(m).find(k => k.toLowerCase().includes('abp'));
        let val = abpKey ? String(m[abpKey]).toLowerCase().trim() : null;
        
        if (val === 'sí' || val === 'si' || val === 'yes') {
            aplicaABP.push(m);
        } else if (val === 'no') {
            noAplicaABP.push(m);
        } else {
            sinDatoABP.push(m);
        }
    });

    // Ranking de Docentes ABP
    const docentesABPCount = {};
    aplicaABP.forEach(m => {
        const docenteStr = m.Docente || 'Desconocido';
        const docentes = docenteStr.split(' - ').map(d => d.trim()).filter(d => d && d.toUpperCase() !== 'DESCONOCIDO');
        docentes.forEach(d => {
            docentesABPCount[d] = (docentesABPCount[d] || 0) + 1;
        });
    });

    const rankingHtml = Object.entries(docentesABPCount)
        .sort((a, b) => b[1] - a[1]) // Mayor a menor
        .map((entry, index) => {
            let medalla = '';
            if (index === 0) medalla = '🥇 ';
            else if (index === 1) medalla = '🥈 ';
            else if (index === 2) medalla = '🥉 ';
            else medalla = `<span style="display:inline-block; width:20px; text-align:center; color:#777;">${index + 1}.</span> `;
            return `<li style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
                <span>${medalla}<b style="color:#eee;">${entry[0]}</b></span>
                <span style="background:var(--color-primary); color:#fff; padding:2px 8px; border-radius:12px; font-weight:bold; font-size:11px;">${entry[1]} mat.</span>
            </li>`;
        }).join('') || '<li style="color:#aaa; font-style:italic; text-align:center;">No hay datos de docentes aún.</li>';

    let chartsHtml = `
        <div style="grid-column: 1 / -1; background: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h4 style="margin:0 0 25px; font-size: 14px; text-transform: uppercase; color: var(--color-primary); letter-spacing:1px;">🎓 Aplicación de Aprendizaje Basado en Proyectos (ABP)</h4>
            <div style="display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start;">
                <div style="width: 250px; height: 250px; flex-shrink:0; position:relative;">
                    <canvas id="abpChart"></canvas>
                </div>
                <div id="abp-detail" style="flex:1; min-width:250px; background:#222; padding:20px; border-radius:12px; max-height:250px; overflow-y:auto; border:1px solid #444;">
                    <p style="color:#aaa; text-align:center; font-style:italic; margin-top:50px;">Hacé clic en un sector del gráfico para ver el detalle de las materias.</p>
                </div>
                <div style="flex:1; min-width:250px; background:#222; padding:20px; border-radius:12px; max-height:250px; overflow-y:auto; border:1px solid #444;">
                    <h5 style="color:var(--color-primary); margin-top:0; border-bottom:1px solid var(--color-primary); padding-bottom:8px; position:sticky; top:0; background:#222; z-index:1;">🏆 Top Docentes ABP</h5>
                    <ul style="list-style:none; padding:0; margin:0; font-size:13px;">
                        ${rankingHtml}
                    </ul>
                </div>
            </div>
        </div>

        <div style="grid-column: 1 / -1; background: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h4 style="margin:0 0 25px; font-size: 14px; text-transform: uppercase; color: var(--color-primary); letter-spacing:1px;">📊 Desempeño por Ítem Individual</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:25px;">
    `;

    Object.entries(globalScores).forEach(([id, vals]) => {
        const avg = parseFloat(getAvg(vals));
        const perc = (avg / 4) * 100;
        const color = avg >= 3 ? 'var(--color-green-light)' : (avg >= 2 ? 'var(--color-yellow)' : 'var(--color-red)');
        
        let label = id.toUpperCase();
        Object.values(RUBRICAS).forEach(cat => {
            const item = cat.items.find(i => i.id === id);
            if (item) label = item.label;
        });
        
        chartsHtml += `
            <div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:11px;">
                    <span style="color:#aaa; font-weight:700;">${label}</span>
                    <span style="color:${color}; font-weight:900;">${avg}</span>
                </div>
                <div style="background:#222; height:6px; border-radius:3px; overflow:hidden; border: 1px solid #333;">
                    <div style="width:${perc}%; height:100%; background:${color}; box-shadow: 0 0 10px ${color}44;"></div>
                </div>
            </div>
        `;
    });

    chartsHtml += `</div></div>`;
    document.getElementById('analiticas-charts').innerHTML = chartsHtml;

    // Renderizar gráfico de pie para ABP
    setTimeout(() => {
        const ctx = document.getElementById('abpChart');
        if (ctx && (aplicaABP.length > 0 || noAplicaABP.length > 0 || sinDatoABP.length > 0)) {
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Aplica ABP', 'No Aplica', 'Sin Respuesta/Otro'],
                    datasets: [{
                        data: [aplicaABP.length, noAplicaABP.length, sinDatoABP.length],
                        backgroundColor: ['#22c55e', '#ef4444', '#facc15'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#ccc'} }
                    },
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const segmentIndex = elements[0].index;
                            window.mostrarDetalleABP(segmentIndex, aplicaABP, noAplicaABP, sinDatoABP);
                        }
                    }
                }
            });
        }
    }, 100);
};

window.mostrarDetalleABP = function(index, aplica, noAplica, sinDato) {
    const detailDiv = document.getElementById('abp-detail');
    if (!detailDiv) return;

    let title = '';
    let lista = [];
    if (index === 0) { title = 'Materias que Aplican ABP'; lista = aplica; }
    else if (index === 1) { title = 'Materias que NO Aplican ABP'; lista = noAplica; }
    else { title = 'Sin Respuesta o en Revisión'; lista = sinDato; }

    if (lista.length === 0) {
        detailDiv.innerHTML = `<h5 style="color:var(--color-primary); margin-top:0;">${title} (0)</h5><p style="color:#aaa; font-size:13px;">No hay materias en esta categoría.</p>`;
        return;
    }

    let listHtml = lista.map(m => `<li style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #333;">
        <b style="color:#eee;">${m.Materia || m.Materia_Base}</b><br>
        <span style="color:#888; font-size:12px;">Docente: ${m.Docente} | Coord: ${m.Coordinador || '-'}</span>
        </li>`).join('');

    detailDiv.innerHTML = `
        <h5 style="color:var(--color-primary); margin-top:0; border-bottom:1px solid var(--color-primary); padding-bottom:8px; position:sticky; top:0; background:#222;">${title} (${lista.length})</h5>
        <ul style="list-style:none; padding:0; margin:0; font-size:13px;">${listHtml}</ul>
    `;
};

/**
 * Inicialización de pestañas
 */
function initViewTabs() {
    document.querySelectorAll('.view-tab').forEach(btn => {
        btn.onclick = () => {
            const targetView = btn.getAttribute('data-view');
            
            // UI Update
            document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // View update
            document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
            document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
            
            const activePanel = document.getElementById(`view-${targetView}`);
            if (activePanel) {
                activePanel.classList.remove('hidden');
                activePanel.classList.add('active');
            }

            // Cargas específicas
            if (targetView === 'analiticas') renderAnaliticasAuditoria();
        };
    });
}
