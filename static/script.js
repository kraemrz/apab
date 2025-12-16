// static/script.js – Inspection Editor med historik + autosave

// --- Hjälpfunktioner (globalt) ---
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

async function writeDataToFileHandle(fileHandle, blob) {
    if (!fileHandle || typeof fileHandle.createWritable !== 'function') {
        throw new Error("Invalid FileSystemFileHandle provided to writeDataToFileHandle.");
    }
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}

function fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderServiceReports(reports, machineNo) {
    const container = document.getElementById("service-info-container");
    if (!container) {
        console.warn("Service info container saknas i DOM");
        return;
    }
    container.innerHTML = "";

    if (!reports || reports.length === 0) {
        console.group("Service report lookup");
        console.log("Maskin:", machineNo);
        console.log("Reports:", reports);
        console.groupEnd();
        return;
    }

    const box = document.createElement("div");
    box.className = "service-info-box";

    const header = document.createElement("div");
    header.className = "service-info-header";
    header.textContent = "Servicerapporter sedan senaste inspektion";
    box.appendChild(header);

    const body = document.createElement("div");
    body.className = "service-info-body";

    reports.forEach(r => {
        const row = document.createElement("div");
        row.className = "service-row";

        row.innerHTML = `
            <span class="service-date">${r.service_date}</span>
            <a class="service-link" href="${r.url}" target="_blank">
                ${r.filename}
            </a>
        `;

        body.appendChild(row);
    });

    box.appendChild(body);
    container.appendChild(box);

    // liten luft efter
    const gap = document.createElement("div");
    gap.className = "service-info-gap";
    container.appendChild(gap);
}

// --- KNAPP MÖRKT/LJUST LÄGE (global) ---
window.toggleDark = function () {
    document.body.classList.toggle('dark-mode');

    const toggleButton = document.getElementById('theme-toggle-btn');
    if (toggleButton) {
        const isDarkMode = document.body.classList.contains('dark-mode');
        toggleButton.innerHTML = isDarkMode ? '☀️ Ljust läge' : '🌙 Mörkt läge';
    }
};


// --- Huvudlogik ---
document.addEventListener("DOMContentLoaded", function () {
    // --- SERVICE WORKER REG ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js')
                .then(reg => console.log('Service Worker registered with scope:', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }

    // --- REFERENCES ---
    const dropZone          = document.getElementById("drop-zone");
    const fileInput         = document.getElementById("fileInput");
    const exportForm        = document.getElementById("exportForm");
    const resultDiv         = document.getElementById("result");
    const exportControls    = document.getElementById("exportControls");
    const historyToggleBtn  = document.getElementById('history-toggle-button');

    const htmlInput         = document.getElementById('htmlInput');
    const inspectionDateInp = document.getElementById('inspectionDateInput');
    const langInput         = document.getElementById('langInput');
    const customerInput     = document.getElementById('customerInput');
    const machineInput      = document.getElementById('machineInput');
    const commentsInput     = document.getElementById('commentsInput');

    const saveTempButton    = document.getElementById('saveTempDocxButton');

    let historicalData   = {};
    let comments         = [];
    let currentLang      = "sv";
    let currentCustomer  = "Okänd Kund";
    let currentMachine   = "Okänd Maskin";

    // --- ONLINE / OFFLINE LOGIK ---
    let saveWordButton = exportForm.querySelector('button[type="submit"]#saveWordSubmitButton');
    if (!saveWordButton) {
        console.warn("saveWordButton med ID #saveWordSubmitButton hittades inte, använder första submit-knappen i exportForm.");
        saveWordButton = exportForm.querySelector('button[type="submit"]');
    }

    const offlineMessageElement = document.createElement('div');
    offlineMessageElement.id = 'offline-status-message';
    offlineMessageElement.style.cssText = `
        background-color: #ffc107;
        color: #343a40;
        padding: 8px 15px;
        border-radius: 5px;
        margin-top: 10px;
        display: none;
        text-align: center;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    offlineMessageElement.textContent =
        '❌ Appen är offline. Vissa funktioner (som att spara Word) kräver internetanslutning.';
    exportControls.appendChild(offlineMessageElement);

    let isActuallyOnline = navigator.onLine;

    async function checkRealOnlineStatus() {
        if (!navigator.onLine) {
            isActuallyOnline = false;
            console.log("checkRealOnlineStatus: navigator.onLine är false.");
            updateUIBasedOnConnection(false);
            return;
        }

        console.log("checkRealOnlineStatus: pingar /ping...");
        try {
            const response = await fetch('/ping', { method: 'HEAD', cache: 'no-store' });
            isActuallyOnline = response.ok;
            console.log(`checkRealOnlineStatus: svar = ${response.status} (${response.ok ? 'OK' : 'Fel'})`);
        } catch (err) {
            isActuallyOnline = false;
            console.error("checkRealOnlineStatus: fel vid ping:", err);
        }
        updateUIBasedOnConnection(isActuallyOnline);
    }

    function updateUIBasedOnConnection(onlineStatus) {
        if (onlineStatus) {
            console.log("Appen är online.");
            if (saveWordButton) {
                saveWordButton.disabled = false;
                saveWordButton.style.opacity = '1';
                saveWordButton.style.cursor = 'pointer';
            }
            offlineMessageElement.style.display = 'none';
        } else {
            console.log("Appen är offline.");
            if (saveWordButton) {
                saveWordButton.disabled = true;
                saveWordButton.style.opacity = '0.5';
                saveWordButton.style.cursor = 'not-allowed';
            }
            offlineMessageElement.style.display = 'block';
        }
    }

    window.addEventListener('online', checkRealOnlineStatus);
    window.addEventListener('offline', checkRealOnlineStatus);
    checkRealOnlineStatus();

    // --- AUTOSAVE ---
    let currentAutosaveFileHandle = null;
    let currentAutosaveFilename   = '';

    const debouncedAutosave = debounce(autosaveToJson, 2000);

    async function autosaveToJson() {
        if (!currentAutosaveFileHandle) {
            console.log("Autosave: inget filhandtag, hoppar över.");
            return;
        }

        console.log("Autosave: sparar tyst till fil:", currentAutosaveFilename);
        const allData = collectAllDataForJSON();
        const dataStr = JSON.stringify(allData, null, 2);
        const blob    = new Blob([dataStr], { type: 'application/json' });

        try {
            await writeDataToFileHandle(currentAutosaveFileHandle, blob);
            console.log("Autosave: klart.");
        } catch (error) {
            console.error("Autosave: fel:", error);
            if (['NotFoundError', 'NotAllowedError', 'SecurityError'].includes(error.name)) {
                alert("Autosparning misslyckades: filen hittades inte eller åtkomst nekades. Spara manuellt för att återaktivera autosparning.");
            } else {
                alert(`Autosparning misslyckades oväntat: ${error.message}. Spara manuellt för att återaktivera autosparning.`);
            }
            currentAutosaveFileHandle = null;
            currentAutosaveFilename   = '';
        }
    }

    // --- EVENT HANDLERS: FIL ---
    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length === 0) return;
        const file = e.target.files[0];

        if (file.name.endsWith(".docx")) {
            handleFileUpload(file);
        } else if (file.name.endsWith(".json")) {
            processJSONFile(file);
        } else {
            alert("Endast .docx- och .json-filer är tillåtna!");
        }
    });

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");

        if (e.dataTransfer.files.length === 0) return;
        const file = e.dataTransfer.files[0];

        if (file.name.endsWith(".docx")) {
            handleFileUpload(file);
        } else if (file.name.endsWith(".json")) {
            processJSONFile(file);
        } else {
            alert("Endast .docx- och .json-filer är tillåtna!");
        }
    });

    // --- TOGGLE HISTORIK ---
    historyToggleBtn.addEventListener("click", () => {
        const isHidden = resultDiv.classList.contains("history-hidden");
        if (isHidden) {
            resultDiv.classList.remove("history-hidden");
            historyToggleBtn.textContent = "📜 Dölj historik";
        } else {
            resultDiv.classList.add("history-hidden");
            historyToggleBtn.textContent = "📜 Visa historik";
        }
    });

    // --- MAIN: DOCX-UPPLADDNING ---
    function handleFileUpload(file) {
    const formData = new FormData();
    formData.append("file", file);
    resultDiv.innerHTML = '🔄 Läser in och analyserar dokumentet...';

    fetch("/upload", { method: "POST", body: formData })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                resultDiv.innerHTML = `❌ Fel vid inläsning: ${data.error}`;
                currentAutosaveFileHandle = null;
                currentAutosaveFilename   = '';
                return;
            }

            historicalData         = data.history || {};
            resultDiv.dataset.lang = data.lang;

            // 🔥 Bygger tabeller & historik
            displayContent(data.blocks);

            currentLang     = data.lang;
            currentCustomer = data.customer;
            currentMachine  = data.machine;

            langInput.value     = currentLang;
            customerInput.value = currentCustomer;
            machineInput.value  = currentMachine;

            renderServiceReports(data.service_reports, currentMachine);


            exportControls.style.display = "flex";
                })
                .catch(err => {
                    console.error(err);
                    resultDiv.innerHTML = '❌ Ett fel uppstod vid kommunikation med servern.';
                    currentAutosaveFileHandle = null;
                    currentAutosaveFilename   = '';
                });
            }



    // --- MAIN: JSON-UPPLADDNING (temporär fil) ---
    function processJSONFile(file) {
        resultDiv.innerHTML        = '🔄 Laddar in temporär JSON-fil...';
        exportControls.style.display = 'none';

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const jsonData = JSON.parse(event.target.result);
                console.log("JSON-data inläst:", jsonData);

                resultDiv.innerHTML   = jsonData.html || '';
                resultDiv.dataset.lang = jsonData.lang || 'sv';

                currentLang     = jsonData.lang || 'sv';
                currentCustomer = jsonData.customer || 'Okänd Kund';
                currentMachine  = jsonData.machine || 'Okänd Maskin';
                comments        = jsonData.comments || [];
                historicalData  = jsonData.historicalData || {};

                langInput.value     = currentLang;
                customerInput.value = currentCustomer;
                machineInput.value  = currentMachine;

                const inspectionDateField = document.getElementById('inspection-date-field');
                if (inspectionDateField) {
                    inspectionDateField.value = jsonData.inspectionDate || new Date().toISOString().slice(0, 10);
                }

                const signatureField = document.getElementById('signature-field');
                if (signatureField) {
                    signatureField.value = jsonData.signature || '';
                }

                resultDiv.classList.add('history-hidden');
                historyToggleBtn.textContent = "📜 Visa historik";

                attachInteractionHandlers();
                exportControls.style.display = "flex";

                // laddad fil -> autosave aktiveras först vid ny manuell "spara temporärt"
                currentAutosaveFileHandle = null;
                currentAutosaveFilename   = '';

            } catch (e) {
                console.error('Fel vid parsning av JSON:', e);
                resultDiv.innerHTML = `❌ Fel vid inläsning av JSON-fil: ${e.message}`;
                alert("Det gick inte att läsa in den temporära filen.");
            }
        };
        reader.onerror = function (event) {
            console.error('Fil läsfel:', event.target.error);
            resultDiv.innerHTML = `❌ Fel vid läsning av fil: ${event.target.error.name}`;
        };
        reader.readAsText(file);
    }

    // --- EXPORT: FÖR WORD ---
    function prepareDocumentContentAndCommentsForWordExport(skipPrompt = false) {
        const commentsToSave = [];
        let currentStation = "";

        resultDiv.querySelectorAll('h1, h2, table.inspection-table').forEach(element => {
            if (element.tagName === 'H1') {
                // STATION = H1 ("Station 101"), matchar databasen
                currentStation = element.textContent.trim();
                return;
            } 

            if ( element.tagName === 'H2') {
                const section = element.textContent.trim().toLowerCase();
                if (
                    section.startsWith('övrigt') || section.startsWith('other')){
                currentStation = 'Övrigt';

            }
            return;
        }
            else if (element.tagName === 'TABLE' && element.classList.contains('inspection-table')) {
                const actionColIndex = 1;

                element.querySelectorAll('tr').forEach((row, idx) => {
                    if (idx === 0) return;
                    const statusCell  = row.children[0];
                    const actionCell  = row.children[actionColIndex];
                    const commentCell = row.children[2];

                    if (!statusCell || !actionCell || !commentCell) return;

                    const statusText  = statusCell.textContent.trim().toLowerCase();
                    const actionText  = actionCell.textContent.trim();
                    const commentText = commentCell.textContent.trim();
                    const normalizedCommentText = normalizeComment(commentText);

                    if ((statusText === 'anm.' || statusText === 'note') && normalizedCommentText) {
                        commentsToSave.push({
                            station: currentStation,
                            action: actionText,
                            comment: normalizedCommentText
                        });
                    }
                });
            }
        });

        const dateFieldInTable = document.getElementById('inspection-date-field');
        const defaultDate      = dateFieldInTable ? dateFieldInTable.value : new Date().toISOString().slice(0, 10);
        let finalInspectionDate = defaultDate;

        if (!skipPrompt) {
            finalInspectionDate = prompt("Ange inspektionsdatum för filnamnet (ÅÅÅÅ-MM-DD):", defaultDate);
            if (!finalInspectionDate) return null;
        }

        const tempResultDiv = document.createElement('div');
        tempResultDiv.innerHTML = resultDiv.innerHTML;

        // Ta bort historik-kolumnen inför export
        tempResultDiv.querySelectorAll('table').forEach(table => {
            const colToRemove = table.querySelector('colgroup col:nth-child(4)');
            if (colToRemove) colToRemove.remove();

            table.querySelectorAll('tr').forEach(row => {
                const cellToRemove = row.children[3];
                if (cellToRemove) cellToRemove.remove();
            });
        });

        const dateFieldInClonedDiv = tempResultDiv.querySelector("#inspection-date-field");
        const liveDateField        = document.getElementById('inspection-date-field');
        if (dateFieldInClonedDiv && liveDateField) {
            dateFieldInClonedDiv.parentElement.innerHTML = liveDateField.value;
        }

        const signatureFieldInClonedDiv = tempResultDiv.querySelector("#signature-field");
        const liveSignatureField        = document.getElementById('signature-field');
        if (signatureFieldInClonedDiv && liveSignatureField) {
            signatureFieldInClonedDiv.parentElement.innerHTML = liveSignatureField.value;
        }

        tempResultDiv.querySelectorAll('.editable-comment').forEach(cell => {
            cell.textContent = cell.textContent;
            cell.removeAttribute('contenteditable');
        });

        return {
            htmlContent: tempResultDiv.innerHTML,
            comments: commentsToSave,
            inspectionDate: finalInspectionDate,
            signature: liveSignatureField ? liveSignatureField.value : ''
        };
    }

    // --- DATA FÖR JSON-SPARRNING ---
    function collectAllDataForJSON() {
        const rawHtmlContent = resultDiv.innerHTML;
        const commentsData   = [];
        let currentStation   = "";

        resultDiv.querySelectorAll('h1, h2, table.inspection-table').forEach(element => {
            if (element.tagName === 'H1') {
                currentStation = element.textContent.trim(); // H1 = Station 101
            } else if (element.tagName === 'TABLE' && element.classList.contains('inspection-table')) {
                const actionColIndex = 1;
                element.querySelectorAll('tr').forEach((row, idx) => {
                    if (idx === 0) return;
                    const statusCell  = row.children[0];
                    const actionCell  = row.children[actionColIndex];
                    const commentCell = row.children[2];
                    if (!statusCell || !actionCell || !commentCell) return;

                    const statusText  = statusCell.textContent.trim().toLowerCase();
                    const actionText  = actionCell.textContent.trim();
                    const commentText = commentCell.textContent.trim();
                    const normalizedCommentText = normalizeComment(commentText);

                    if ((statusText === 'anm.' || statusText === 'note') && normalizedCommentText) {
                        commentsData.push({
                            station: currentStation,
                            action: actionText,
                            comment: normalizedCommentText
                        });
                    }
                });
            }
        });

        const inspectionDateField = document.getElementById('inspection-date-field');
        const inspectionDate      = inspectionDateField ? inspectionDateField.value : new Date().toISOString().slice(0, 10);

        const signatureField = document.getElementById('signature-field');
        const signature      = signatureField ? signatureField.value : '';

        return {
            html: rawHtmlContent,
            lang: currentLang,
            customer: currentCustomer,
            machine: currentMachine,
            inspectionDate: inspectionDate,
            signature: signature,
            comments: commentsData,
            historicalData: historicalData
        };
    }

    function normalizeComment(commentText) {
        if (!commentText) return '';
        const trimmed = commentText.trim();
        const upper   = trimmed.toUpperCase();
        if (upper === 'U/A' || upper === 'WITHOUT NOTICE') return '';
        return trimmed;
    }

    // --- BYGG HTML + HISTORIK FRÅN BLOCKS ---
    function displayContent(blocks) {
        let html = "";
        let currentStation = "";

        blocks.forEach(block => {
            if (block.type === 'paragraph') {
                if (block.text.toLowerCase().startsWith('station')) {
                    // H1 = Station XXX -> station_name i databasen
                    currentStation = block.text.trim();
                    html += `<h1>${block.text}</h1>`;
                } else {
                    html += `<h2>${block.text}</h2>`;
                }
            } else if (block.type === 'table') {
                const tableData = block.data || [];
                if (tableData.length === 0) return;

                const isSignatureTable =
                    tableData[0][0]?.toLowerCase().includes('date') ||
                    tableData[0][0]?.toLowerCase().includes('datum');

                if (isSignatureTable) {
                    html += `
                        <table class="table-grid">
                            <tr>
                                <th>${tableData[0][0]}</th>
                                <th>${tableData[0][1]}</th>
                            </tr>
                            <tr>
                                <td>
                                    <input type="date"
                                           class="form-control"
                                           id="inspection-date-field"
                                           name="inspection_date_ui"
                                           value="${tableData[1]?.[0] || ''}">
                                </td>
                                <td>
                                    <input type="text"
                                           class="form-control"
                                           id="signature-field"
                                           name="signature_ui"
                                           value="${tableData[1]?.[1] || ''}">
                                </td>
                            </tr>
                            ${tableData.length > 2 ? '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' : ''}
                        </table>
                    `;
                } else {
                    html += `
                        <table class="table-grid inspection-table">
                            <colgroup>
                                <col class="col-status">
                                <col class="col-action">
                                <col class="col-comment">
                                <col class="col-history">
                            </colgroup>
                    `;

                    const headers = tableData[0] || [];
                    html += `
                        <tr>
                            <th>${headers[0] || 'Status'}</th>
                            <th>${headers[1] || 'Åtgärd'}</th>
                            <th>${headers[2] || 'Kommentar'}</th>
                            <th>Historik</th>
                        </tr>
                    `;

                    const actionColIndex = 1;

                    tableData.slice(1).forEach(row => {
                        const actionText = row[actionColIndex] || "";

                        // CRITICAL: station_name = H1 (Station 101), action_text = åtgärd
                        const historyKey   = `${currentStation}|${actionText}`;
                        const historyItems = historicalData[historyKey];

                        let historyHtml = '<span class="no-history">Ingen historik</span>';
                        if (historyItems && historyItems.length > 0) {
                            historyHtml = historyItems
                                .map(h => `<div class="history-item"><strong>${h.date}:</strong> ${h.comment}</div>`)
                                .join('');
                        }

                        html += `
                            <tr>
                                <td>${row[0] || ''}</td>
                                <td>${actionText}</td>
                                <td contenteditable="true" class="editable-comment">${row[2] || ''}</td>
                                <td class="history-cell">${historyHtml}</td>
                            </tr>
                        `;
                    });

                    html += `</table>`;
                }
            }
        });

        resultDiv.innerHTML = html;
        resultDiv.classList.add('history-hidden');
        historyToggleBtn.textContent = "📜 Visa historik";

        attachInteractionHandlers();
    }

    // --- INTERAKTION I TABELL ---
    function attachInteractionHandlers() {
        const editableCells = document.querySelectorAll('.editable-comment');

        const selectAllText = event => {
            setTimeout(() => {
                const selection = window.getSelection();
                const range     = document.createRange();
                range.selectNodeContents(event.target);
                selection.removeAllRanges();
                selection.addRange(range);
            }, 0);
        };

        editableCells.forEach(cell => {
            cell.removeEventListener('keydown', handleCellNavigation);
            cell.removeEventListener('focus', selectAllText);
            cell.removeEventListener('input', updateStatusOnInput);
            cell.removeEventListener('input', debouncedAutosave);

            cell.addEventListener('keydown', handleCellNavigation);
            cell.addEventListener('focus',  selectAllText);
            cell.addEventListener('input',  updateStatusOnInput);
            cell.addEventListener('input',  debouncedAutosave); // autosave på textändring
        });
    }

    function handleCellNavigation(event) {
        if (event.key !== 'Enter' && event.key !== 'Tab') return;
        event.preventDefault();
        const allEditableCells = Array.from(document.querySelectorAll('.editable-comment'));
        const currentIndex     = allEditableCells.indexOf(event.target);
        const nextIndex        = (currentIndex + 1) % allEditableCells.length;
        const nextCell         = allEditableCells[nextIndex];
        if (nextCell) nextCell.focus();
    }

    function updateStatusOnInput(event) {
        const cellElement = event.target;
        const row         = cellElement.closest('tr');
        const statusCell  = row.children[0];
        const lang        = resultDiv.dataset.lang || 'sv';
        if (!statusCell) return;

        const commentText    = cellElement.textContent.trim().toUpperCase();
        const defaultComment = (lang === 'en') ? "WITHOUT NOTICE" : "U/A";
        const noteStatus     = (lang === 'en') ? "Note" : "Anm.";

        statusCell.textContent =
            (commentText === defaultComment || commentText === "") ? "OK" : noteStatus;
    }

    // --- EXPORTFORM SUBMIT ---
    exportForm.addEventListener("submit", function (e) {
        e.preventDefault();

        if (!isActuallyOnline) {
            alert("Kan inte spara Word-dokument. Du är offline.");
            return;
        }

        const exportData = prepareDocumentContentAndCommentsForWordExport();
        if (!exportData) return;

        htmlInput.value         = exportData.htmlContent;
        commentsInput.value     = JSON.stringify(exportData.comments);
        inspectionDateInp.value = exportData.inspectionDate;
        langInput.value         = currentLang;
        customerInput.value     = currentCustomer;
        machineInput.value      = currentMachine;

        const signatureInputHidden = document.getElementById('signatureInput');
        if (signatureInputHidden) {
            signatureInputHidden.value = exportData.signature;
        } else {
            console.warn("Dolt fält med ID 'signatureInput' saknas i HTML. Signaturen kommer inte skickas till servern.");
        }

        const formData = new FormData(exportForm);

        fetch(exportForm.action, {
            method: "POST",
            body: formData,
        })
            .then(response => {
                if (!response.ok) throw new Error('Nätverkssvar var inte ok.');
                const disposition = response.headers.get('Content-Disposition');
                let filename = 'download.docx';
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }
                return response.blob().then(blob => ({ blob, filename }));
            })
            .then(({ blob, filename }) => {
                const url = window.URL.createObjectURL(blob);
                const a   = document.createElement('a');
                a.style.display = 'none';
                a.href          = url;
                a.download      = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                setTimeout(() => location.reload(), 500);
            })
            .catch(error => {
                console.error('Fel vid export:', error);
                alert('Ett fel uppstod vid exporten.');
            });
    });

    // --- SPARA TILLFÄLLIGT (JSON + ev. autosave) ---
    if (saveTempButton) {
        saveTempButton.addEventListener('click', async function () {
            console.log("Spara tillfälligt (JSON)-knappen klickad!");

            const allData = collectAllDataForJSON();

            const customerNamePart = allData.customer.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const machineNamePart  = allData.machine.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const datePart         = allData.inspectionDate || new Date().toISOString().slice(0, 10);
            const baseFilename     = `temporar_arbetsfil_${customerNamePart}_${machineNamePart}_${datePart}.json`;

            const dataStr = JSON.stringify(allData, null, 2);
            const blob    = new Blob([dataStr], { type: 'application/json' });

            try {
                const options = {
                    suggestedName: baseFilename,
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] },
                    }],
                };

                currentAutosaveFileHandle = await window.showSaveFilePicker(options);
                currentAutosaveFilename   = currentAutosaveFileHandle.name;

                await writeDataToFileHandle(currentAutosaveFileHandle, blob);

                console.log("Temporär JSON-fil sparad. Autosave aktiv:", currentAutosaveFilename);
                alert("Temporär JSON-fil sparad lokalt! Autosparning aktiverad för denna fil.");
            } catch (error) {
                console.error("Kunde inte spara fil med File System Access API:", error);
                if (error.name === 'AbortError') {
                    alert("Filsparning avbruten. Autosparning är inte aktiverad.");
                } else if (typeof window.showSaveFilePicker === 'undefined') {
                    alert("Din webbläsare stöder inte File System Access API. Autosparning kan inte aktiveras till samma fil. Filen laddades ner normalt.");
                    fallbackDownload(blob, baseFilename);
                } else {
                    alert(`Ett oväntat fel uppstod vid sparning: ${error.message}. Filen laddades ner normalt.`);
                    fallbackDownload(blob, baseFilename);
                }
                currentAutosaveFileHandle = null;
                currentAutosaveFilename   = '';
            }
        });
    }

}); // DOMContentLoaded
