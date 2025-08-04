document.addEventListener("DOMContentLoaded", function () {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("fileInput");
    const exportForm = document.getElementById("exportForm");
    const resultDiv = document.getElementById("result");
    const exportControls = document.getElementById("exportControls");

    // --- LOGIK FÖR UPPLADDNING (Oförändrad) ---
    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) handleFileUpload(fileInput.files[0]);
    });
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
    });

    function handleFileUpload(file) {
        if (!file.name.endsWith(".docx")) { alert("Endast .docx-filer är tillåtna!"); return; }
        const formData = new FormData();
        formData.append("file", file);
        resultDiv.innerHTML = '🔄 Läser in och analyserar dokumentet...';

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
                }
            })
            .catch((error) => { resultDiv.innerHTML = '❌ Ett fel uppstod vid kommunikation med servern.'; });
    }

    // --- KOMPLETT FUNKTION FÖR ATT VISA INNEHÅLL ---
    function displayContent(blocks) {
        let html = "";
        const lang = resultDiv.dataset.lang || 'sv';

        blocks.forEach((block) => {
            if (block.type === 'paragraph' && block.text.toLowerCase() === 'dokumentidentitet') {
                return;
            }

            if (block.type === 'paragraph') {
                if (block.text.toLowerCase().startsWith('station')) { html += `<h1>${block.text}</h1>`; } 
                else { html += `<h2>${block.text}</h2>`; }
            } else if (block.type === 'table') {
                const tableData = block.data || [];
                if (tableData.length === 0) return;

                const isSwedishNATable = tableData.length === 1 && tableData[0].length === 1 && tableData[0][0]?.toUpperCase() === 'N/A';
                const isEnglishNATable = tableData.length > 1 && tableData[1] && tableData[1].some(cell => cell.toUpperCase() === 'N/A');
                const isNATable = isSwedishNATable || isEnglishNATable;
                const isSignatureTable = tableData[0][0]?.toLowerCase().includes('date') || tableData[0][0]?.toLowerCase().includes('datum');

                if (isNATable) {
                    html += '<table class="table-grid na-table">';
                    tableData.forEach((row, rowIndex) => {
                        html += `<tr>${row.map(cell => rowIndex === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`;
                    });
                    html += '</table>';
                } else if (isSignatureTable) {
                    html += `<table class="table-grid">
                                <tr><th>${tableData[0][0]}</th><th>${tableData[0][1]}</th></tr>
                                <tr>
                                    <td><input type="date" class="form-control" id="inspection-date-field" value="${tableData[1]?.[0] || ''}"></td>
                                    <td><input type="text" class="form-control" id="signature-field" value="${tableData[1]?.[1] || ''}"></td>
                                </tr>`;
                    if (tableData.length > 2) { html += `<tr><td> </td><td> </td></tr>`; }
                    html += '</table>';
                } else {
                    // **HÄR ÄR DEN NYA LOGIKEN**
                    html += '<table class="table-grid">';
                    const headers = tableData[0] || [];

                    // 1. Skapa <colgroup> för att definiera kolumnbredder
                    html += '<colgroup>';
                    headers.forEach(header => {
                        const h = header.toLowerCase();
                        if (h === 'status' || h === 'results') {
                            html += '<col class="col-status">';
                        } else if (h === 'åtgärd' || h === 'description') {
                            html += '<col class="col-action">';
                        } else if (h === 'kommentar' || h === 'comment') {
                            html += '<col class="col-comment">';
                        } else {
                            html += '<col>'; // Fallback för okända kolumner
                        }
                    });
                    html += '</colgroup>';

                    // 2. Bygg resten av tabellen som vanligt
                    const statusColIndex = headers.findIndex(h => h.toLowerCase() === 'status' || h.toLowerCase() === 'results');
                    const commentColIndex = headers.findIndex(h => h.toLowerCase() === 'kommentar' || h.toLowerCase() === 'comment');
                    tableData.forEach((row, rowIndex) => {
                        html += '<tr>';
                        row.forEach((cell, cellIndex) => {
                            if (rowIndex === 0) { html += `<th>${cell}</th>`; } 
                            else {
                                if (cellIndex === commentColIndex) {
                                    html += `<td contenteditable="true" class="editable-comment" oninput="updateStatus(this, ${statusColIndex}, '${lang}')">${cell}</td>`;
                                } else {
                                    html += `<td>${cell}</td>`;
                                }
                            }
                        });
                        html += '</tr>';
                    });
                    html += '</table>';
                }
            }
        });
        resultDiv.innerHTML = html;
    }
    
    // --- FUNKTIONER FÖR INTERAKTIVITET & EXPORT (Oförändrade) ---
    window.updateStatus = function(cellElement, statusColIndex, lang) {
        const row = cellElement.closest('tr');
        if (!row || statusColIndex === -1) return;
        const statusCell = row.children[statusColIndex];
        const commentText = cellElement.textContent.trim().toUpperCase();
        const defaultComment = (lang === 'en') ? "WITHOUT NOTICE" : "U/A";
        const noteStatus = (lang === 'en') ? "Note" : "Anm.";
        statusCell.textContent = (commentText === defaultComment || commentText === "") ? "OK" : noteStatus;
    };

    exportForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const tempResultDiv = document.createElement('div');
        tempResultDiv.innerHTML = resultDiv.innerHTML;

        const dateField = tempResultDiv.querySelector("#inspection-date-field");
        if (dateField) { dateField.parentElement.innerHTML = document.getElementById('inspection-date-field').value; }
        const signatureField = tempResultDiv.querySelector("#signature-field");
        if (signatureField) { signatureField.parentElement.innerHTML = document.getElementById('signature-field').value; }

        const originalCommentCells = resultDiv.querySelectorAll('.editable-comment');
        tempResultDiv.querySelectorAll('.editable-comment').forEach((cellInClone, index) => {
            cellInClone.innerHTML = originalCommentCells[index].textContent;
            cellInClone.removeAttribute('contenteditable');
            cellInClone.removeAttribute('oninput');
            cellInClone.removeAttribute('class');
        });
        
        document.getElementById("htmlInput").value = tempResultDiv.innerHTML;
        const dateForFilename = document.getElementById('inspection-date-field')?.value || new Date().toISOString().slice(0, 10);
        const inspectionDateForFilename = prompt("Ange inspektionsdatum för filnamnet (ÅÅÅÅ-MM-DD):", dateForFilename);
        
        if (!inspectionDateForFilename) return;
        document.getElementById('inspectionDateInput').value = inspectionDateForFilename;

        this.submit();
    });

    window.toggleDark = function() { document.body.classList.toggle('dark-mode'); };
});