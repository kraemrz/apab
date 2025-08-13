// static/script.js (Komplett och slutgiltig version)

document.addEventListener("DOMContentLoaded", function () {
    // --- REFERENSER TILL HTML-ELEMENT ---
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("fileInput");
    const exportForm = document.getElementById("exportForm");
    const resultDiv = document.getElementById("result");
    const exportControls = document.getElementById("exportControls");
    const historyContainer = document.getElementById('history-container');
    const historyButton = document.getElementById('history-button');
    const historyTableBody = document.querySelector('#history-table tbody');

    // --- GRUNDLÄGGANDE HÄNDELSER ---
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

    historyButton.addEventListener('click', () => {
        if (historyContainer.style.display === 'none' || historyContainer.style.display === '') {
            historyContainer.style.display = 'block';
        } else {
            historyContainer.style.display = 'none';
        }
    });

    window.toggleDark = function() { document.body.classList.toggle('dark-mode'); };

    // --- HUVUDFUNKTIONER ---

    function handleFileUpload(file) {
        if (!file.name.endsWith(".docx")) { alert("Endast .docx-filer är tillåtna!"); return; }
        const formData = new FormData();
        formData.append("file", file);
        resultDiv.innerHTML = '🔄 Läser in och analyserar dokumentet...';
        historyContainer.style.display = 'none';
        historyTableBody.innerHTML = '';

        fetch("/upload", { method: "POST", body: formData })
            .then((response) => response.json())
            .then((data) => {
                if (data.error) {
                    resultDiv.innerHTML = `❌ Fel vid inläsning: ${data.error}`;
                } else {
                    resultDiv.dataset.lang = data.lang;
                    displayContent(data.blocks);
                    document.getElementById('langInput').value = data.lang;
                    document.getElementById('customerInput').value = data.customer;
                    document.getElementById('machineInput').value = data.machine;
                    exportControls.style.display = "flex";

                    if (data.history && data.history.length > 0) {
                        data.history.forEach(item => {
                            const row = document.createElement('tr');
                            const date = new Date(item.inspection_date).toLocaleDateString('sv-SE');
                            let commentsHtml = '<span class="no-comments">Inga anmärkningar</span>';
                            if (item.comments && item.comments.length > 0) {
                                commentsHtml = item.comments.map(comment =>
                                    `<div class="comment-item"><strong>${comment.station_name}:</strong> ${comment.comment_text}</div>`
                                ).join('');
                            }
                            row.innerHTML = `<td>${date}</td><td>${item.customer}</td><td>${commentsHtml}</td>`;
                            historyTableBody.appendChild(row);
                        });
                    }
                }
            })
            .catch((error) => { resultDiv.innerHTML = '❌ Ett fel uppstod vid kommunikation med servern.'; console.error(error); });
    }

    function displayContent(blocks) {
        let html = "";
        blocks.forEach((block) => {
            if (block.type === 'paragraph' && block.text.toLowerCase() === 'dokumentidentitet') return;
            if (block.type === 'paragraph') {
                if (block.text.toLowerCase().startsWith('station')) { html += `<h1>${block.text}</h1>`; } 
                else { html += `<h2>${block.text}</h2>`; }
            } else if (block.type === 'table') {
                const tableData = block.data || [];
                if (tableData.length === 0) return;
                const lang = resultDiv.dataset.lang || 'sv';
                const isSwedishNATable = tableData.length === 1 && tableData[0].length === 1 && tableData[0][0]?.toUpperCase() === 'N/A';
                const isEnglishNATable = tableData.length > 1 && tableData[1] && tableData[1].some(cell => cell.toUpperCase() === 'N/A');
                const isNATable = isSwedishNATable || isEnglishNATable;
                const isSignatureTable = tableData[0][0]?.toLowerCase().includes('date') || tableData[0][0]?.toLowerCase().includes('datum');
                if (isNATable) {
                    html += '<table class="table-grid na-table">';
                    tableData.forEach((row, rowIndex) => { html += `<tr>${row.map(cell => rowIndex === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`; });
                    html += '</table>';
                } else if (isSignatureTable) {
                    html += `<table class="table-grid"><tr><th>${tableData[0][0]}</th><th>${tableData[0][1]}</th></tr><tr><td><input type="date" class="form-control" id="inspection-date-field" value="${tableData[1]?.[0] || ''}"></td><td><input type="text" class="form-control" id="signature-field" value="${tableData[1]?.[1] || ''}"></td></tr>`;
                    if (tableData.length > 2) { html += `<tr><td> </td><td> </td></tr>`; }
                    html += '</table>';
                } else {
                    html += '<table class="table-grid">';
                    const headers = tableData[0] || [];
                    html += '<colgroup>';
                    headers.forEach(header => {
                        const h = header.toLowerCase();
                        if (h === 'status' || h === 'results') { html += '<col class="col-status">'; } 
                        else if (h === 'åtgärd' || h === 'description') { html += '<col class="col-action">'; } 
                        else if (h === 'kommentar' || h === 'comment') { html += '<col class="col-comment">'; } 
                        else { html += '<col>'; }
                    });
                    html += '</colgroup>';
                    const statusColIndex = headers.findIndex(h => h.toLowerCase() === 'status' || h.toLowerCase() === 'results');
                    const commentColIndex = headers.findIndex(h => h.toLowerCase() === 'kommentar' || h.toLowerCase() === 'comment');
                    tableData.forEach((row, rowIndex) => {
                        html += '<tr>';
                        row.forEach((cell, cellIndex) => {
                            if (rowIndex === 0) { html += `<th>${cell}</th>`; } 
                            else {
                                if (cellIndex === commentColIndex) { html += `<td contenteditable="true" class="editable-comment">${cell}</td>`; } 
                                else { html += `<td>${cell}</td>`; }
                            }
                        });
                        html += '</tr>';
                    });
                    html += '</table>';
                }
            }
        });
        resultDiv.innerHTML = html;
        attachInteractionHandlers();
    }

    // --- HJÄLPFUNKTIONER FÖR INTERAKTIVITET ---

    function attachInteractionHandlers() {
        const editableCells = document.querySelectorAll('.editable-comment');
        
        const selectAllText = (event) => {
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
        const headers = Array.from(row.closest('table').querySelectorAll('th')).map(th => th.textContent.toLowerCase());
        const statusColIndex = headers.findIndex(h => h === 'status' || h.toLowerCase() === 'results');
        const lang = resultDiv.dataset.lang || 'sv';
        
        if (!row || statusColIndex === -1) return;
        const statusCell = row.children[statusColIndex];
        const commentText = cellElement.textContent.trim().toUpperCase();
        const defaultComment = (lang === 'en') ? "WITHOUT NOTICE" : "U/A";
        const noteStatus = (lang === 'en') ? "Note" : "Anm.";
        statusCell.textContent = (commentText === defaultComment || commentText === "") ? "OK" : noteStatus;
    }

    // --- EXPORT-LOGIK MED FETCH OCH RELOAD ---
    exportForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const commentsToSave = [];
        let currentStation = "";
        resultDiv.querySelectorAll('h1, table').forEach(element => {
            if (element.tagName === 'H1') {
                currentStation = element.textContent.trim();
            } else if (element.tagName === 'TABLE' && currentStation) {
                const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.toLowerCase());
                const statusColIndex = headers.findIndex(h => h === 'status' || h === 'results');
                const commentColIndex = headers.findIndex(h => h === 'kommentar' || h === 'comment');
                if (statusColIndex === -1 || commentColIndex === -1) return;
                element.querySelectorAll('tr').forEach((row, rowIndex) => {
                    if (rowIndex === 0) return;
                    const statusCell = row.children[statusColIndex];
                    const commentCell = row.children[commentColIndex];
                    if (statusCell && commentCell) {
                        const statusText = statusCell.textContent.trim().toLowerCase();
                        const commentText = commentCell.textContent.trim();
                        if ((statusText === 'anm.' || statusText === 'note') && commentText) {
                            commentsToSave.push({ station: currentStation, comment: commentText });
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
            cell.removeAttribute('oninput');
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