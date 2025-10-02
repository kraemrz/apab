// static/script.js (Den fullständigt korrigerade och kompletta versionen)

document.addEventListener("DOMContentLoaded", function () {
    // --- SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            // FIX: Ändrat 'service-worker' till 'serviceWorker' (CamelCase)
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            }).catch(error => {
                console.error('Service Worker registration failed:', error);
            });
        });
    }

    // --- REFERENCES ---
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("fileInput");
    const exportForm = document.getElementById("exportForm");
    const resultDiv = document.getElementById("result");
    const exportControls = document.getElementById("exportControls");
    const historyToggleButton = document.getElementById('history-toggle-button');
    
    // FIX: Deklarera referenser till de dolda inputfälten här
    const htmlInput = document.getElementById('htmlInput');
    const inspectionDateInput = document.getElementById('inspectionDateInput');
    const langInput = document.getElementById('langInput');
    const customerInput = document.getElementById('customerInput');
    const machineInput = document.getElementById('machineInput');
    const commentsInput = document.getElementById('commentsInput');

    let historicalData = {};
    let comments = []; // Antar att denna globala variabel håller kommentarerna
    let currentLang = "sv"; // Initialvärde
    let currentCustomer = "Okänd Kund"; // Initialvärde
    let currentMachine = "Okänd Maskin"; // Initialvärde

    const saveTempDocxButton = document.getElementById('saveTempDocxButton');

    // --- NY LOGIK FÖR ONLINE/OFFLINE STATUS ---
    const saveWordButton = exportForm.querySelector('button[type="submit"]');

     // NY: Element för offline-meddelande
    const offlineMessageElement = document.createElement('div');
    offlineMessageElement.id = 'offline-status-message';
    offlineMessageElement.style.cssText = `
        background-color: #ffc107; /* Varningsfärg */
        color: #343a40;
        padding: 8px 15px;
        border-radius: 5px;
        margin-top: 10px;
        display: none; /* Dold som standard */
        text-align: center;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    offlineMessageElement.textContent = '❌ Appen är offline. Vissa funktioner (som att spara Word) kräver internetanslutning.';
    // Lägg till meddelandet någonstans i DOM, t.ex. inuti exportControls
    exportControls.appendChild(offlineMessageElement);

        function updateOnlineStatus() {
        if (navigator.onLine) {
            console.log("Appen är online.");
            if (saveWordButton) {
                saveWordButton.disabled = false; // Aktivera knappen
                saveWordButton.style.opacity = '1';
                saveWordButton.style.cursor = 'pointer';
            }
            if (offlineMessageElement) offlineMessageElement.style.display = 'none'; // Dölj meddelandet
        } else {
            console.log("Appen är offline.");
            if (saveWordButton) {
                saveWordButton.disabled = true; // Avaktivera knappen
                saveWordButton.style.opacity = '0.5'; // Indikera att den är inaktiv
                saveWordButton.style.cursor = 'not-allowed';
            }
            if (offlineMessageElement) offlineMessageElement.style.display = 'block'; // Visa meddelandet
        }
    }

    // Registrera eventlyssnare för online/offline-händelser
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial körning för att sätta rätt status när sidan laddas
    updateOnlineStatus(); 
    // --- SLUT NY LOGIK FÖR ONLINE/OFFLINE STATUS ---

    
    // --- EVENT HANDLERS ---
    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.name.endsWith(".docx")) {
                handleFileUpload(file); // För .docx, använd befintlig logik
            } else if (file.name.endsWith(".json")) {
                processJSONFile(file); // För .json, använd ny logik
            } else {
                alert("Endast .docx- och .json-filer är tillåtna!");
            }
        }
 
    });
    // Drag-and-drop för både .docx och .json
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith(".docx")) {
                handleFileUpload(file);
            } else if (file.name.endsWith(".json")) {
                processJSONFile(file);
            } else {
                alert("Endast .docx- och .json-filer är tillåtna!");
            }
        }
    });
    
    window.toggleDark = function() { document.body.classList.toggle('dark-mode'); };

    historyToggleButton.addEventListener('click', () => {
        resultDiv.classList.toggle('history-hidden');
        if (resultDiv.classList.contains('history-hidden')) {
            historyToggleButton.textContent = '📜 Visa historik';
        } else {
            historyToggleButton.textContent = '📜 Dölj historik';
        }
    });

    // --- MAIN FUNCTIONS ---
    // Funktion för att hantera uppladdning av .docx-filer (befintlig server-side logik)
    function handleFileUpload(file) {
        const formData = new FormData();
        formData.append("file", file);
        resultDiv.innerHTML = '🔄 Läser in och analyserar dokumentet...';
        
        fetch("/upload", { method: "POST", body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    resultDiv.innerHTML = `❌ Fel vid inläsning: ${data.error}`;
                } else {
                    historicalData = data.history || {};
                    resultDiv.dataset.lang = data.lang;
                    displayContent(data.blocks);
                    
                    // Uppdatera globala variabler med data från servern
                    currentLang = data.lang;
                    currentCustomer = data.customer;
                    currentMachine = data.machine;

                    // Fyll de dolda fälten med de nu aktuella värdena (OBS! HTML/Comments fylls av prepareDocumentContent...)
                    langInput.value = data.lang;
                    customerInput.value = data.customer;
                    machineInput.value = data.machine;
                    exportControls.style.display = "flex";
                }
            })
            .catch(error => { resultDiv.innerHTML = '❌ Ett fel uppstod vid kommunikation med servern.'; console.error(error); });
    }

    // NY FUNKTION: För att hantera uppladdning av .json-filer (klientside-logik)
    function processJSONFile(file) {
        resultDiv.innerHTML = '🔄 Laddar in temporär JSON-fil...';
        exportControls.style.display = 'none'; // Dölj kontroller tills data är laddad

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const jsonData = JSON.parse(event.target.result);
                console.log("JSON-data inläst:", jsonData);

                // Populera resultDiv med sparad HTML
                resultDiv.innerHTML = jsonData.html || '';
                resultDiv.dataset.lang = jsonData.lang || 'sv';

                // Dölj historiken när JSON laddas in
                resultDiv.classList.add('history-hidden'); 
                historyToggleButton.textContent = '📜 Visa historik'; 

                // Uppdatera globala variabler med sparad data
                currentLang = jsonData.lang || 'sv';
                currentCustomer = jsonData.customer || 'Okänd Kund';
                currentMachine = jsonData.machine || 'Okänd Maskin';
                comments = jsonData.comments || []; // Ladda in sparade kommentarer
                historicalData = jsonData.historicalData || {}; // Ladda in historikdata om den sparades

                // Fyll dolda input-fält för exportForm
                langInput.value = currentLang;
                customerInput.value = currentCustomer;
                machineInput.value = currentMachine;
                // inspectionDateInput och htmlInput fylls senare vid export/temp-save
                // commentsInput fylls också av prepareDocumentContent...

                // Uppdatera synliga inputfält om de finns i DOM
                const inspectionDateField = document.getElementById('inspection-date-field');
                if (inspectionDateField) inspectionDateField.value = jsonData.inspectionDate || new Date().toISOString().slice(0, 10);
                
                const signatureField = document.getElementById('signature-field');
                if (signatureField) signatureField.value = jsonData.signature || ''; // Ladda in signaturvärde om det finns i JSON

                attachInteractionHandlers(); // Återaktivera interaktionshanterare
                exportControls.style.display = "flex"; // Visa exportkontroller igen
                               

            } catch (e) {
                resultDiv.innerHTML = `❌ Fel vid inläsning av JSON-fil: ${e.message}`;
                console.error('Fel vid parsning av JSON:', e);
                alert("Det gick inte att läsa in den temporära filen.");
            }
        };
        reader.onerror = function(event) {
            resultDiv.innerHTML = `❌ Fel vid läsning av fil: ${event.target.error.name}`;
            console.error('Fil läsfel:', event.target.error);
        };
        reader.readAsText(file); // Läs filen som text
    }


    // Funktion för att extrahera och städa HTML, och samla kommentarer
    // Används för den slutgiltiga Word-exporten
    function prepareDocumentContentAndCommentsForWordExport(skipPrompt = false) {
        const commentsToSave = [];
        let currentStation = "";
        resultDiv.querySelectorAll('h1, table.inspection-table').forEach(element => {
            if (element.tagName === 'H1') {
                currentStation = element.textContent.trim();
            } else if (element.tagName === 'TABLE') {
                const actionColIndex = 1;
                element.querySelectorAll('tr').forEach((row, rowIndex) => {
                    if (rowIndex === 0) return;
                    const statusCell = row.children[0];
                    const actionCell = row.children[actionColIndex];
                    const commentCell = row.children[2];
                    if (statusCell && actionCell && commentCell) {
                        const statusText = statusCell.textContent.trim().toLowerCase();
                        const actionText = actionCell.textContent.trim();
                        const commentText = commentCell.textContent.trim();
                        if ((statusText === 'anm.' || statusText === 'note') && commentText) {
                            commentsToSave.push({ station: currentStation, action: actionText, comment: commentText });
                        }
                    }
                });
            }
        });

        const dateFieldInTable = document.getElementById('inspection-date-field');
        const defaultDate = dateFieldInTable ? dateFieldInTable.value : new Date().toISOString().slice(0, 10);
        let finalInspectionDate = defaultDate;

        if (!skipPrompt) {
            finalInspectionDate = prompt("Ange inspektionsdatum för filnamnet (ÅÅÅÅ-MM-DD):", defaultDate);
            if (!finalInspectionDate) return null; // Avbryt om användaren avbröt prompten
        }

        const tempResultDiv = document.createElement('div');
        tempResultDiv.innerHTML = resultDiv.innerHTML; // KLONA DET RÅA INNEHÅLLET

        // STÄDA BORT HISTORIKEN FRÅN KLONEN
        tempResultDiv.querySelectorAll('table').forEach(table => {
            const colToRemove = table.querySelector('colgroup col:nth-child(4)');
            if (colToRemove) colToRemove.remove();
            table.querySelectorAll('tr').forEach(row => {
                const cellToRemove = row.children[3]; // TH/TD vid index 3 (fjärde elementet)
                if (cellToRemove) cellToRemove.remove();
            });
        });

        // HÄR ÄR DEN KRITISKA LOGIKEN FÖR DATUM OCH SIGNATUR
        // Den hämtar värdet från det *levande* fältet och ersätter input-taggen med bara värdet.
        const dateFieldInClonedDiv = tempResultDiv.querySelector("#inspection-date-field");
        const liveDateField = document.getElementById('inspection-date-field'); 
        if (dateFieldInClonedDiv && liveDateField) {
            dateFieldInClonedDiv.parentElement.innerHTML = liveDateField.value; 
        } else {
            console.warn("prepareDocumentContentForWordExport: Datumfält (#inspection-date-field) hittades inte i klonen eller live DOM.");
        }

        const signatureFieldInClonedDiv = tempResultDiv.querySelector("#signature-field");
        const liveSignatureField = document.getElementById('signature-field');
        if (signatureFieldInClonedDiv && liveSignatureField) {
            signatureFieldInClonedDiv.parentElement.innerHTML = liveSignatureField.value; 
        } else {
            console.warn("prepareDocumentContentForWordExport: Signaturfält (#signature-field) hittades inte i klonen eller live DOM.");
        }

        tempResultDiv.querySelectorAll('.editable-comment').forEach(cell => {
            cell.textContent = cell.textContent;
            cell.removeAttribute('contenteditable');
        });

        return {
            htmlContent: tempResultDiv.innerHTML,
            comments: commentsToSave,
            inspectionDate: finalInspectionDate,
            signature: liveSignatureField ? liveSignatureField.value : '' // Inkludera signaturen här också, för säkerhets skull
        };
    }
    
    // --- Funktion för att extrahera all data för JSON-sparning ---
    function collectAllDataForJSON() {
        const rawHtmlContent = resultDiv.innerHTML;
        const commentsData = [];
        let currentStation = "";
        resultDiv.querySelectorAll('h1, table.inspection-table').forEach(element => {
            if (element.tagName === 'H1') {
                currentStation = element.textContent.trim();
            } else if (element.tagName === 'TABLE') {
                const actionColIndex = 1;
                element.querySelectorAll('tr').forEach((row, rowIndex) => {
                    if (rowIndex === 0) return;
                    const statusCell = row.children[0];
                    const actionCell = row.children[actionColIndex];
                    const commentCell = row.children[2];
                    if (statusCell && actionCell && commentCell) {
                        const statusText = statusCell.textContent.trim().toLowerCase();
                        const actionText = actionCell.textContent.trim();
                        const commentText = commentCell.textContent.trim();
                        if ((statusText === 'anm.' || statusText === 'note') && commentText) {
                            commentsData.push({ station: currentStation, action: actionText, comment: commentText });
                        }
                    }
                });
            }
        });

        const inspectionDateField = document.getElementById('inspection-date-field');
        const inspectionDate = inspectionDateField ? inspectionDateField.value : new Date().toISOString().slice(0, 10);
        
        const signatureField = document.getElementById('signature-field');
        const signature = signatureField ? signatureField.value : ''; 
        
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


    function displayContent(blocks) {
        let html = "";
        let currentStation = "";
        blocks.forEach(block => {
            if (block.type === 'paragraph') {
                if (block.text.toLowerCase().startsWith('station')) {
                    currentStation = block.text;
                    html += `<h1>${block.text}</h1>`;
                } else {
                    html += `<h2>${block.text}</h2>`;
                }
            } else if (block.type === 'table') {
                const tableData = block.data || [];
                if (tableData.length === 0) return;
                const isSignatureTable = tableData[0][0]?.toLowerCase().includes('date') || tableData[0][0]?.toLowerCase().includes('datum');
                if (isSignatureTable) {
                    html += `<table class="table-grid"><tr><th>${tableData[0][0]}</th><th>${tableData[0][1]}</th></tr><tr><td><input type="date" class="form-control" id="inspection-date-field" name="inspection_date_ui" value="${tableData[1]?.[0] || ''}"></td><td><input type="text" class="form-control" id="signature-field" name="signature_ui" value="${tableData[1]?.[1] || ''}"></td></tr>`;
                    if (tableData.length > 2) { html += `<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`; }
                    html += '</table>';
                } else {
                    html += '<table class="table-grid inspection-table">';
                    const headers = tableData[0] || [];
                    html += `<colgroup><col class="col-status"><col class="col-action"><col class="col-comment"><col class="col-history"></colgroup>`;
                    html += `<tr><th>${headers[0] || 'Status'}</th><th>${headers[1] || 'Åtgärd'}</th><th>${headers[2] || 'Kommentar'}</th><th>Historik</th></tr>`;
                    const actionColIndex = 1;
                    tableData.slice(1).forEach(row => {
                        const actionText = row[actionColIndex] || "";
                        const historyKey = `${currentStation}|${actionText}`;
                        const historyItems = historicalData[historyKey];
                        let historyHtml = '<span class="no-history">Ingen historik</span>';
                        if (historyItems && historyItems.length > 0) {
                            historyHtml = historyItems.map(h => `<div class="history-item"><strong>${h.date}:</strong> ${h.comment}</div>`).join('');
                        }
                        html += `<tr><td>${row[0] || ''}</td><td>${actionText}</td><td contenteditable="true" class="editable-comment">${row[2] || ''}</td><td class="history-cell">${historyHtml}</td></tr>`;
                    });
                    html += '</table>';
                }
            }
        });
        resultDiv.innerHTML = html;
        resultDiv.classList.add('history-hidden');
        attachInteractionHandlers();
    }

    // --- INTERACTIVITY HELPERS ---
    function attachInteractionHandlers() {
        const editableCells = document.querySelectorAll('.editable-comment');
        const selectAllText = event => {
            setTimeout(() => {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(event.target);
                selection.removeAllRanges();
                selection.addRange(range);
            }, 0);
        };
        editableCells.forEach(cell => {
            cell.removeEventListener('keydown', handleCellNavigation);
            cell.removeEventListener('focus', selectAllText);
            cell.removeEventListener('input', updateStatusOnInput);
            cell.addEventListener('keydown', handleCellNavigation);
            cell.addEventListener('focus', selectAllText);
            cell.addEventListener('input', updateStatusOnInput);
        });
    }

    function handleCellNavigation(event) {
        if (event.key !== 'Enter' && event.key !== 'Tab') return;
        event.preventDefault();
        const allEditableCells = Array.from(document.querySelectorAll('.editable-comment'));
        const currentCellIndex = allEditableCells.indexOf(event.target);
        const nextCellIndex = (currentCellIndex + 1) % allEditableCells.length;
        const nextCell = allEditableCells[nextCellIndex];
        if (nextCell) {
            nextCell.focus();
        }
    }

    function updateStatusOnInput(event) {
        const cellElement = event.target;
        const row = cellElement.closest('tr');
        const statusCell = row.children[0];
        const lang = resultDiv.dataset.lang || 'sv';
        if (!statusCell) return;
        const commentText = cellElement.textContent.trim().toUpperCase();
        const defaultComment = (lang === 'en') ? "WITHOUT NOTICE" : "U/A";
        const noteStatus = (lang === 'en') ? "Note" : "Anm.";
        statusCell.textContent = (commentText === defaultComment || commentText === "") ? "OK" : noteStatus;
    }

    // --- EXPORT LOGIC (med städning av historik) ---
    exportForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const exportData = prepareDocumentContentAndCommentsForWordExport(); 
        if (!exportData) return;

        htmlInput.value = exportData.htmlContent;
        commentsInput.value = JSON.stringify(exportData.comments);
        inspectionDateInput.value = exportData.inspectionDate;
        langInput.value = currentLang;
        customerInput.value = currentCustomer;
        machineInput.value = currentMachine;
        
        // NY KOD: Sätt signaturen till det dolda inputfältet
        // OBS: Kräver <input type="hidden" name="signature" id="signatureInput"> i din index.html
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
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            setTimeout(() => {
                location.reload();
            }, 500);
        })
        .catch(error => {
            console.error('Fel vid export:', error);
            alert('Ett fel uppstod vid exporten.');
        });
    });

    // === Event Listener for Spara tillfälligt (NY LOGIK - JSON) ===
    if (saveTempDocxButton) {
        saveTempDocxButton.addEventListener('click', function() {
            console.log("Spara tillfälligt (JSON)-knappen klickad!");

            const allData = collectAllDataForJSON(); 
            
            const customerNamePart = allData.customer.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const machineNamePart = allData.machine.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const datePartForFilename = allData.inspectionDate || new Date().toISOString().slice(0, 10);
            const filename = `temporar_arbetsfil_${customerNamePart}_${machineNamePart}_${datePartForFilename}.json`;
            
            const dataStr = JSON.stringify(allData, null, 2);

            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log("Temporär JSON-fil nedladdad:", filename);
            alert("Temporär JSON-fil sparad lokalt!");
        });
    }
});