// =======================================================
// === CONFIGURACIÓN DE LA API ===
// =======================================================
// ⚠️ REEMPLAZA ESTAS URLs con las de tu API desplegada en Railway
const API_BASE_URL = "https://apiwater-production.up.railway.app";
// Usa 'wss' ya que Railway fuerza HTTPS, y por lo tanto WebSockets seguros (wss)
const WS_URL = API_BASE_URL.replace('http', 'ws') + "/ws";

// =======================================================
// === VARIABLES GLOBALES (Inicializadas dentro de DOMContentLoaded) ===
// =======================================================
let wsStatus;
let turbidezLive;
let tdsLive;
let lastUpdate;
let historicalTableBody;

let turbidezIndicator;
let tdsIndicator;
let turbidezChart;
let tdsChart;
const chartDataLimit = 50;

/**
 * Evalúa el porcentaje de turbidez y devuelve una clasificación.
 * (Basado en la lógica del código Arduino inicial)
 */
function evaluarTurbidez(porcentaje) {
    if (porcentaje < 10) {
        return { label: "Agua Muy Clara", class: "clean" };
    } else if (porcentaje < 40) {
        return { label: "Ligeramente Turbia", class: "medium" };
    } else if (porcentaje < 75) {
        return { label: "Moderadamente Turbia", class: "high" };
    } else {
        return { label: "Agua Muy Turbia", class: "alert" };
    }
}

/**
 * Evalúa el valor TDS (ppm) y devuelve una clasificación.
 * (Basado en rangos comunes de calidad de agua)
 */
function evaluarTDS(tds) {
    if (tds <= 100) {
        return { label: "Excelente (Baja Mineralización)", class: "clean" };
    } else if (tds <= 300) {
        return { label: "Aceptable (Potable)", class: "medium" };
    } else if (tds <= 600) {
        return { label: "Alta (No ideal)", class: "high" };
    } else {
        return { label: "Muy Alta (Inaceptable)", class: "alert" };
    }
}

function formatTimestampToPeruTime(timestamp) {
    // 1. Aseguramos que la cadena sea interpretada como UTC (Añadiendo 'Z' si no está presente)
    // El formato ISO 8601 de FastAPI sin 'Z' a veces se interpreta como hora local del navegador.
    let utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';

    // 2. Crear el objeto Date a partir del string UTC forzado
    const date = new Date(utcTimestamp);

    // 3. Opciones de Formato
    const options = {
        // Formato de fecha y hora
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false, // Formato 24 horas

        // 🔑 FORZAR EL HUSO HORARIO DE LIMA
        timeZone: 'America/Lima'
    };

    // 4. Devolver la cadena formateada
    return date.toLocaleString('es-PE', options);
}

// =======================================================
// === INICIALIZACIÓN AL CARGAR LA PÁGINA ===
// =======================================================
window.onload = () => {

    // Asignar nuevos indicadores (requiere agregar IDs al HTML)
    turbidezIndicator = document.getElementById('turbidez-indicator');
    tdsIndicator = document.getElementById('tds-indicator');

    // 1. Asignar las variables DOM DESPUÉS de que el HTML ha cargado
    wsStatus = document.getElementById('ws-status');
    turbidezLive = document.getElementById('turbidez-live');
    tdsLive = document.getElementById('tds-live');
    lastUpdate = document.getElementById('last-update');
    historicalTableBody = document.getElementById('historical-table-body');

    // 2. Iniciar la lógica de la aplicación
    connectWebSocket(); // Iniciar conexión en vivo
    fetchHistoricalData(); // Cargar datos históricos iniciales
};

// =======================================================
// === LÓGICA WEBSOCKET (VISTA EN VIVO) ===
// =======================================================
let websocket;

function connectWebSocket() {
    websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
        console.log("Conexión WebSocket establecida.");
        // Ahora wsStatus ya NO es null
        wsStatus.textContent = "● Conectado";
        wsStatus.className = "status-indicator connected";
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Dato en vivo recibido:", data);
        updateLiveUI(data);
        addLivePointToCharts(data);
        addLivePointToTable(data);
    };

    websocket.onclose = (event) => {
        console.warn("Conexión WebSocket cerrada:", event.code, event.reason);
        // Ahora wsStatus ya NO es null
        wsStatus.textContent = "● Desconectado";
        wsStatus.className = "status-indicator disconnected";
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onerror = (error) => {
        console.error("Error de WebSocket:", error);
    };
}

function updateLiveUI(data) {
    // APLICAR FORMATO DE HORA DE PERÚ AQUÍ
    const formattedTimestamp = formatTimestampToPeruTime(data.timestamp);

    // 1. Actualizar valores
    const turbidezPct = data.turbidez_porcentaje;
    const tdsPpm = data.tds_ppm;

    turbidezLive.textContent = `${turbidezPct.toFixed(1)} %`;
    tdsLive.textContent = `${tdsPpm.toFixed(2)} ppm`;
    lastUpdate.textContent = `Última actualización: ${formattedTimestamp}`;

    // 2. Actualizar indicadores de calidad
    const turbidezEval = evaluarTurbidez(turbidezPct);
    const tdsEval = evaluarTDS(tdsPpm);

    turbidezIndicator.textContent = turbidezEval.label;
    turbidezIndicator.className = `indicator ${turbidezEval.class}`;

    tdsIndicator.textContent = tdsEval.label;
    tdsIndicator.className = `indicator ${tdsEval.class}`;
}

// =======================================================
// === LÓGICA PARA DATOS HISTÓRICOS Y GRÁFICOS ===
// =======================================================

async function fetchHistoricalData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/historical?limit=${chartDataLimit}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Datos históricos recibidos:", data);

        // La data está llegando correctamente, según tu consola
        initializeCharts(data);
        populateHistoricalTable(data);

    } catch (error) {
        // Mostrar error en la consola, ya no debería ser TypeError si los IDs están bien
        console.error("Error al obtener datos históricos:", error);
    }
}

function initializeCharts(data) {
    const labels = data.map(item => formatTimestampToPeruTime(item.timestamp).split(', ')[1]); // Solo la hora
    const turbidezValues = data.map(item => item.turbidez_porcentaje);
    const tdsValues = data.map(item => item.tds_ppm);

    const ctxTurbidez = document.getElementById('turbidezChart').getContext('2d');
    const ctxTDS = document.getElementById('tdsChart').getContext('2d');

    if (turbidezChart) turbidezChart.destroy();
    if (tdsChart) tdsChart.destroy();

    // --- GRÁFICO DE TURBIDEZ ---
    turbidezChart = new Chart(ctxTurbidez, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Turbidez (%)',
                data: turbidezValues,
                borderColor: '#0056b3',
                backgroundColor: 'rgba(0, 86, 179, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            // ... opciones de Chart.js ...
            plugins: {
                title: { display: true, text: 'Historial de Turbidez', font: { size: 16 } }
            },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });

    // --- GRÁFICO DE TDS ---
    tdsChart = new Chart(ctxTDS, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'TDS (ppm)',
                data: tdsValues,
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            // ... opciones de Chart.js ...
            plugins: {
                title: { display: true, text: 'Historial de TDS', font: { size: 16 } }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function addLivePointToCharts(newData) {
    if (!turbidezChart || !tdsChart) return;

    const newLabel = formatTimestampToPeruTime(newData.timestamp).split(', ')[1];;

    // Lógica para agregar y limitar puntos
    [turbidezChart, tdsChart].forEach(chart => {
        chart.data.labels.push(newLabel);
        if (chart.data.labels.length > chartDataLimit) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
    });

    turbidezChart.data.datasets[0].data.push(newData.turbidez_porcentaje);
    tdsChart.data.datasets[0].data.push(newData.tds_ppm);

    turbidezChart.update('none'); // Usar 'none' para animación discreta
    tdsChart.update('none');
}

function populateHistoricalTable(data) {
    historicalTableBody.innerHTML = '';
    const displayLimit = 20;
    const recentData = data.slice(-displayLimit);

    recentData.forEach(item => {
        const row = historicalTableBody.insertRow();
        row.insertCell().textContent = item.id;
        // APLICAR FORMATO DE HORA DE PERÚ AQUÍ
        row.insertCell().textContent = formatTimestampToPeruTime(item.timestamp);
        row.insertCell().textContent = item.turbidez_porcentaje.toFixed(1);
        row.insertCell().textContent = item.tds_ppm.toFixed(2);
    });
}

function addLivePointToTable(newData) {
    // Ahora historicalTableBody ya NO es null
    if (historicalTableBody.rows.length >= 20) {
        historicalTableBody.deleteRow(0); // Eliminar la fila más antigua
    }
    const row = historicalTableBody.insertRow();
    row.insertCell().textContent = newData.id;
    row.insertCell().textContent = formatTimestampToPeruTime(newData.timestamp);
    row.insertCell().textContent = newData.turbidez_porcentaje.toFixed(1);
    row.insertCell().textContent = newData.tds_ppm.toFixed(2);
}