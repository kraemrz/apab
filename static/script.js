// static/script.js (Den slutgiltiga, kompletta och korrigerade versionen)

document.addEventListener("DOMContentLoaded", function () {
    // --- REFERENSER ---
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("fileInput");
    const exportForm = document.getElementById("exportForm");
    const resultDiv = document.getElementById("result");
    const exportControls = document.getElementById("exportControls");
    const historyToggleButton = document.getElementById('history-toggle-button');
    
    let historicalData = {};

    // --- HÄNDELSER ---
    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) handleFileUpload(fileInput.files[0]);
    });
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
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

    // --- HUVUDFUNKTIONER ---
    function handleFileUpload(file) {
        if (!file.name.endsWith(".docx")) { alert("Endast .docx-filer är tillåtna!"); return; }
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
                    document.getElementById('langInput').value = data.lang;
                    document.getElementById('customerInput').value = data.customer;
                    document.getElementById('machineInput').value = data.machine;
                    exportControls.style.display = "flex";
                }
            })
            .catch(error => { resultDiv.innerHTML = '❌ Ett fel uppstod vid kommunikation med servern.'; console.error(error); });
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
                    html += `<table class="table-grid"><tr><th>${tableData[0][0]}</th><th>${tableData[0][1]}</th></tr><tr><td><input type="date" class="form-control" id="inspection-date-field" value="${tableData[1]?.[0] || ''}"></td><td><input type="text" class="form-control" id="signature-field" value="${tableData[1]?.[1] || ''}"></td></tr>`;
                    if (tableData.length > 2) { html += `<tr><td> </td><td> </td></tr>`; }
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

    // --- HJÄLPFUNKTIONER FÖR INTERAKTIVITET ---
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

    // --- EXPORT-LOGIK ---
    exportForm.addEventListener("submit", function (e) {
        e.preventDefault();
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
        const dateForFilename = document.getElementById('inspection-date-field')?.value || new Date().toISOString().slice(0, 10);
        const inspectionDateForFilename = prompt("Ange inspektionsdatum för filnamnet (ÅÅÅÅ-MM-DD):", dateForFilename);
        if (!inspectionDateForFilename) return;

        const formData = new FormData(exportForm);
        const tempResultDiv = document.createElement('div');
        tempResultDiv.innerHTML = resultDiv.innerHTML;
        const dateField = tempResultDiv.querySelector("#inspection-date-field");
        if (dateField) { dateField.parentElement.innerHTML = document.getElementById('inspection-date-field').value; }
        const signatureField = tempResultDiv.querySelector("#signature-field");
        if (signatureField) { signatureField.parentElement.innerHTML = document.getElementById('signature-field').value; }
        tempResultDiv.querySelectorAll('.editable-comment').forEach(cell => {
            cell.textContent = cell.textContent;
            cell.removeAttribute('contenteditable');
        });
        formData.set("html", tempResultDiv.innerHTML);
        formData.set("comments_json", JSON.stringify(commentsToSave));
        formData.set("inspection_date", inspectionDateForFilename);

        fetch("/export-word", {
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
            alert('Ett fel uppstod vid exporten. Kontrollera konsolen för mer information.');
        });
    });
});
