document.addEventListener('DOMContentLoaded', () => {
        const backButton = document.getElementById('backButton');
        const saveServiceReportButton = document.getElementById('saveServiceReportButton');
        const printPdfButton = document.getElementById('printPdfButton');
        const reportContainer = document.querySelector('.report-container');
        const noSparePartsUsedCheckbox = document.getElementById('noSparePartsUsed'); 

        // ... (toggleSparePartsSectionStyle funktion behålls som i förra svaret) ...
        function toggleSparePartsSectionStyle() {
            if (!reportContainer || !noSparePartsUsedCheckbox) return;
            
            if (noSparePartsUsedCheckbox.checked) {
                reportContainer.classList.add('spareparts-section-disabled');
                reportContainer.classList.remove('spareparts-section-active'); 
            } else {
                reportContainer.classList.add('spareparts-section-active');
                reportContainer.classList.remove('spareparts-section-disabled');
            }
        }

        // Kör vid laddning och lyssna på ändringar
        toggleSparePartsSectionStyle();
        if (noSparePartsUsedCheckbox) {
            noSparePartsUsedCheckbox.addEventListener('change', toggleSparePartsSectionStyle);
        }

        // Händelselyssnare för "Till huvudmenyn"
        if (backButton) {
            backButton.addEventListener('click', () => {
                window.location.href = '/'; 
            });
        }

        // --- Logik för att samla all data från formuläret ---
        function collectServiceReportData() {
            const data = {};

            // Header info
            data.reasonForVisit = Array.from(document.querySelectorAll('input[name="reason"]:checked')).map(cb => cb.value);
            data.workorderProjectNo = document.getElementById('workorderProjectNo').value;
            data.machineNo = document.getElementById('machineNo').value;
            data.date = document.getElementById('date').value;
            data.customer = document.getElementById('customer').value;
            data.address = document.getElementById('address').value;
            data.locality = document.getElementById('locality').value;
            data.performedBy = document.getElementById('performedBy').value;
            
            // *** KORRIGERAT ID: textfältet för Deviation no. har ID:t 'deviationNo' ***
            data.deviationNo = document.getElementById('deviationNo').value; 
            
            data.reference = document.getElementById('reference').value;

            // Questions regarding service work
            data.questions = [];
            for (let i = 1; i <= 4; i++) {
                const questionAnswer = document.querySelector(`input[name="q${i}"]:checked`);
                data.questions.push(questionAnswer ? questionAnswer.value : null);
            }

            // Text areas
            data.descriptionServiceWork = document.getElementById('descriptionServiceWork').value;
            data.notesActionsPerStation = document.getElementById('notesActionsPerStation').value;

            // Spareparts
            data.spareParts = [];
            const partsTableRows = document.querySelectorAll('.parts-table tbody tr');
            partsTableRows.forEach(row => {
                const q1 = row.querySelector('input[name="part_q1"]')?.value || '';
                const d1 = row.querySelector('input[name="part_d1"]')?.value || '';
                const i1 = row.querySelector('input[name="part_i1"]')?.value || '';
                const q2 = row.querySelector('input[name="part_q2"]')?.value || '';
                const d2 = row.querySelector('input[name="part_d2"]')?.value || '';
                const i2 = row.querySelector('input[name="part_i2"]')?.value || '';

                if (q1 || d1 || i1 || q2 || d2 || i2) { 
                     data.spareParts.push({ 
                        quantity1: q1, description1: d1, itemNo1: i1,
                        quantity2: q2, description2: d2, itemNo2: i2
                    });
                }
            });
            data.noSparePartsUsed = noSparePartsUsedCheckbox.checked;

            return data;
        }

        // --- Logik för att spara rapporten (till databasen) ---
        if (saveServiceReportButton) {
            saveServiceReportButton.addEventListener('click', async () => {
                alert('Denna funktion är under utveckling.');
                // ... (Sparlogiken är oförändrad)
            });
        }

        // --- Logik för att skriva ut till PDF ---
        if (printPdfButton) {
            printPdfButton.addEventListener('click', () => {
                const element = reportContainer.cloneNode(true);
                
                element.querySelector('.report-controls')?.remove(); 
                
                // Ersätt alla inmatningsfält med deras värden
                element.querySelectorAll('input[type="text"], input[type="date"], textarea, input[type="number"]').forEach(input => {
                    const valueSpan = document.createElement('span');
                    valueSpan.textContent = input.value || input.getAttribute('value') || ''; 
                    input.replaceWith(valueSpan);
                });

                // Hantera checkbox-grupper (Reason for visit)
                const reasonGroup = element.querySelector('.form-grid .form-field .checkbox-group');
                if (reasonGroup) {
                    const checkedValues = Array.from(reasonGroup.querySelectorAll('input[name="reason"]:checked'))
                                              .map(cb => cb.nextElementSibling.textContent.trim());
                    const textSpan = document.createElement('span');
                    textSpan.style.display = 'block';
                    textSpan.textContent = checkedValues.join(', ') || 'Ingen vald';
                    reasonGroup.replaceWith(textSpan);
                }

                // Hantera radio-grupper
                element.querySelectorAll('.question-table .radio-group').forEach(group => {
                    const checkedRadio = group.querySelector('input[type="radio"]:checked');
                    const textSpan = document.createElement('span');
                    textSpan.textContent = checkedRadio ? checkedRadio.value : 'N/A';
                    
                    const parentCell = group.parentElement;
                    parentCell.textContent = ''; 
                    parentCell.appendChild(textSpan); 
                });

                // Hantera 'No spare parts used' kryssrutan
                const noPartsElement = element.querySelector('#noSparePartsUsed');
                if (noPartsElement) {
                    const statusText = noPartsElement.checked ? 'No spare parts have been used.' : '';
                    const statusSpan = document.createElement('span');
                    statusSpan.textContent = statusText;
                    statusSpan.style.display = 'block';
                    
                    noPartsElement.parentElement.replaceWith(statusSpan);
                }

                // Specifik hantering för spare parts-tabellen (input -> span)
                element.querySelectorAll('.parts-table input').forEach(input => {
                    const valueSpan = document.createElement('span');
                    valueSpan.textContent = input.value;
                    input.replaceWith(valueSpan);
                });
                
                // Ta bort klasser som styr utseendet
                element.classList.remove('spareparts-section-disabled', 'spareparts-section-active');


                const opt = {
                    margin: 10,
                    filename: 'Servicerapport.pdf',
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                html2pdf().set(opt).from(element).save();
            });
        }
    });