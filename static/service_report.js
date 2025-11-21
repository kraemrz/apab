const LANG = {
  en: {
    system: "Quality management system",
    report_title: "SERVICE REPORT",

    reason_title: "Reason for visit:",
    reason1: "Preventive service",
    reason2: "Warranty",
    reason3: "Repairing",
    reason4: "Warranty claim",
    deviation: "Deviation no:",

    info_title: "Information:",
    workorder: "Workorder/ Project no:",
    machine_no: "Machine no:",
    date: "Date:",
    customer: "Customer:",
    address: "Address:",
    locality: "Locality:",
    reference: "Reference:",
    performed_by: "Performed by:",

    q1: "Did the service work result in drawings or other specifications needing to be updated? If so, information is provided to Engineering.",
    q2: "Did the service work lead to any increased or added risks to the machine? If yes, information is provided to Engineering.",
    q3: "Did the service work lead to electrical drawings or software & settings needing to be updated?",
    q4: "Did the service work lead to the need to update documents in the quality management system? If yes, a copy of the form is provided to QA.",

    desc_title: "Description of the service work",
    notes_title: "Notes of actions per station",

    spare_title: "Spare parts",
    spare_none: "No spare parts have been used.",
    spare_qty: "Quantity",
    spare_desc: "Description",
    spare_item: "Item No.",

    footer_doc: "Document no:",
    footer_prepared: "Prepared by:",
    footer_reviewed: "Reviewed by:",
    footer_revision: "Revision:",
    footer_process: "Process:",
    footer_approved: "Approved by:",
    footer_validfrom: "Valid from:",

    yes: "Yes",
    no: "No",
    download_btn: "Download PDF",
  },

  sv: {
    system: "Kvalitetsledningssystem",
    report_title: "SERVICERAPPORT",

    reason_title: "Anledning till besök:",
    reason1: "Förebyggande service",
    reason2: "Garanti",
    reason3: "Reparation",
    reason4: "Avhjälpande service",
    deviation: "Avvikelse nr:",

    info_title: "Information:",
    workorder: "Arbetsorder / Projekt nr:",
    machine_no: "Maskin nr:",
    date: "Datum:",
    customer: "Kund:",
    address: "Adress:",
    locality: "Ort:",
    reference: "Referens:",
    performed_by: "Service utförd av:",

    q1: "Ledde servicearbetet till att ritningar eller andra specifikationer behöver uppdateras? Om ja lämnas information till Konstruktion.",
    q2: "Ledde servicearbetet till att några risker hos maskinen ökat eller tillkommit? Om ja lämnas information till Konstruktion.",
    q3: "Ledde servicearbetet till att elritningar eller software & settings behöver uppdateras?",
    q4: "Ledde servicearbetet till att dokument i kvalitetsledningssystemet behöver uppdateras? Om Ja lämnas en kopia på blanketten till QA.",

    desc_title: "Beskrivning av servicearbetet",
    notes_title: "Anteckningar om åtgärder per station",

    spare_title: "Reservdelar",
    spare_none: "Inga reservdelar har använts",
    spare_qty: "Antal",
    spare_desc: "Beskrivning",
    spare_item: "Art. nr",

    footer_doc: "Dokument nr:",
    footer_prepared: "Framtaget av:",
    footer_reviewed: "Granskat av:",
    footer_revision: "Utgåva:",
    footer_process: "Process:",
    footer_approved: "Godkänt av:",
    footer_validfrom: "Giltig from:",

    yes: "Ja",
    no: "Nej",
    download_btn: "Ladda ner PDF",
  },
};
  // ---------------------------------------------

  // Initiera med svenska som standard
  window.currentLang = "sv";
  
  function setLanguage(lang) {
    window.currentLang = lang;
    const dict = LANG[lang];

    // Uppdatera alla HTML-element med data-i18n
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    // Uppdatera titel
    document.title = dict.report_title;

    // Uppdatera språkknappen
    const flag = document.getElementById("langFlag");
    const label = document.getElementById("langLabel");

    if (lang === "sv") {
      flag.src = "/static/images/se.png";
      label.textContent = "Svenska";
    } else {
      flag.src = "/static/images/gb.png";
      label.textContent = "English";
    }
  }

  function toggleLanguage() {
    const newLang = window.currentLang === "sv" ? "en" : "sv";
    setLanguage(newLang);
  }



// Hjälpfunktion: hämta alla formulärdata
function getFormData() {
  const getCheckedReasonKeys = () =>
    Array.from(document.querySelectorAll('input[name="reason"]'))
      .filter((el) => el.checked)
      .map((el) => el.value); // reason1..4

  const getRadioValue = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  };

  const spareParts = [];
  const rows = document.querySelectorAll("#sparePartsBody tr");
  rows.forEach((row) => {
    const qty = row.querySelector(".sp-qty").value.trim();
    const desc = row.querySelector(".sp-desc").value.trim();
    const item = row.querySelector(".sp-item").value.trim();
    if (qty || desc || item) {
      spareParts.push({ quantity: qty, description: desc, itemNo: item });
    }
  });

  return {
    reasons: getCheckedReasonKeys(),
    deviationNo: document.getElementById("deviationNo").value.trim(),
    workorder: document.getElementById("workorder").value.trim(),
    machineNo: document.getElementById("machineNo").value.trim(),
    serviceDate: document.getElementById("serviceDate").value,
    customer: document.getElementById("customer").value.trim(),
    address: document.getElementById("address").value.trim(),
    locality: document.getElementById("locality").value.trim(),
    reference: document.getElementById("reference").value.trim(),
    performedBy: document.getElementById("performedBy").value.trim(),
    q1: getRadioValue("q1"),
    q2: getRadioValue("q2"),
    q3: getRadioValue("q3"),
    q4: getRadioValue("q4"),
    description: document.getElementById("description").value.trim(),
    notes: document.getElementById("notes").value.trim(),
    noSpareParts: document.getElementById("noSpareParts").checked,
    spareParts,
  };
}

function loadImageAsBase64(url) {
  return fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }));
}

// Bygg pdfMake docDefinition
function buildDocDefinition(data) {
  const L = LANG[window.currentLang || "en"];

  const yesNo = (answer) => {
    if (answer === "Yes") return L.yes;
    if (answer === "No") return L.no;
    return "-";
  };

  const ALL_REASONS = ["reason1", "reason2", "reason3", "reason4"];
  const reasonList = ALL_REASONS.map((key) => {
    const checked = data.reasons.includes(key) ? "[x]" : "[ ]";
    return `${checked}  ${L[key]}`;
  });

  const sparePartsTable =
    data.noSpareParts || data.spareParts.length === 0
      ? [{ text: L.spare_none, italics: true, margin: [0, 5, 0, 5] }]
      : [
          {
            table: {
              widths: ["15%", "*", "30%"],
              body: [
                [
                  { text: L.spare_qty, style: "tableHeader" },
                  { text: L.spare_desc, style: "tableHeader" },
                  { text: L.spare_item, style: "tableHeader" },
                ],
                ...data.spareParts.map((sp) => [
                  sp.quantity || "",
                  sp.description || "",
                  sp.itemNo || "",
                ]),
              ],
            },
            layout: "lightHorizontalLines",
            margin: [0, 5, 0, 5],
          },
        ];

  return {
    pageSize: "A4",
    pageMargins: [35, 40, 35, 40],

    content: [
      // ---------------------------------------------
      // HEADER (logo + title)
      // ---------------------------------------------
      {
        table: {
          widths: ["25%", "75%"],
          body: [
            [
              {
                image: "Logo",
                width: 120,
                alignment: "center",
                margin: [0, 5, 0, 5],
              },
              {
                stack: [
                  {
                    text: L.system,
                    fontSize: 10,
                    alignment: "center",
                    margin: [0, 0, 0, 3],
                  },
                  {
                    text: L.report_title,
                    style: "title",
                    alignment: "center",
                  },
                ],
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 0, 0, 12],
      },

      // ---------------------------------------------
      // TOP SECTION (Left column + right column)
      // ---------------------------------------------
      {
        columns: [
          {
            width: "45%",
            stack: [
              { text: L.reason_title, style: "subtitle", margin: [0, 0, 0, 3] },
              {
                ul: reasonList,
                margin: [0, 0, 0, 5],
              },
              {
                text: `${L.deviation} ${data.deviationNo || "__________________________"}`,
                margin: [0, 3, 0, 0],
              },
            ],
          },

          {
            width: "55%",
            table: {
              widths: [120, "*"],
              body: [
                [{ text: L.workorder, style: "fieldLabel" }, data.workorder || ""],
                [{ text: L.machine_no, style: "fieldLabel" }, data.machineNo || ""],
                [{ text: L.date, style: "fieldLabel" }, data.serviceDate || ""],
                [{ text: L.customer, style: "fieldLabel" }, data.customer || ""],
                [{ text: L.address, style: "fieldLabel" }, data.address || ""],
                [{ text: L.locality, style: "fieldLabel" }, data.locality || ""],
                [{ text: L.reference, style: "fieldLabel" }, data.reference || ""],
                [{ text: L.performed_by, style: "fieldLabel" }, data.performedBy || ""],
              ],
            },
            layout: "noBorders",
          },
        ],
        columnGap: 25,
        margin: [0, 0, 0, 15],
      },

      // ---------------------------------------------
      // YES/NO QUESTIONS (4 rows, 2 columns)
      // ---------------------------------------------
      {
        table: {
          widths: ["*", 60],
          body: [
            [
              {
                text: L.q1,
              },
              { text: yesNo(data.q1), alignment: "center" },
            ],
            [
              {
                text: L.q2,
              },
              { text: yesNo(data.q2), alignment: "center" },
            ],
            [
              {
                text: L.q3,
              },
              { text: yesNo(data.q3), alignment: "center" },
            ],
            [
              {
                text: L.q4
              },
              { text: yesNo(data.q4), alignment: "center" },
            ],
          ],
        },
        layout: {
          fillColor: function (rowIndex) {
            return rowIndex % 2 === 0 ? null : "#f3f4f6";
          },
        },
        margin: [0, 0, 0, 15],
      },

      // ---------------------------------------------
      // DESCRIPTION
      // ---------------------------------------------
      { text: L.desc_title, style: "subtitle" },
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                text: data.description || " ",
                margin: [5, 6, 5, 10],
              },
            ],
          ],
        },
        layout: "box",
        margin: [0, 5, 0, 15],
        pageBreak: "after"
      },

      // ---------------------------------------------
      // NOTES
      // ---------------------------------------------
      { text: L.notes_title, style: "subtitle" },
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                text: data.notes || " ",
                margin: [5, 6, 5, 10],
              },
            ],
          ],
        },
        layout: "box",
        margin: [0, 5, 0, 15],
      },

      // ---------------------------------------------
      // SPARE PARTS
      // ---------------------------------------------
      { text: L.spare_title, style: "subtitle", margin: [0, 5, 0, 5] },
      ...sparePartsTable,
    ],

footer: function(currentPage, pageCount) {
  if (currentPage === 2) {
    return {
      margin: [35, 0, 35, 20],
      table: {
        widths: ["*", "*", "*", "*"],
        body: [
          [
              { text: `${L.footer_doc} APB0027`, fontSize: 8 },
              { text: `${L.footer_prepared} Charlotte Tuvesson`, fontSize: 8 },
              { text: `${L.footer_reviewed} Fredrik Sjöstrand`, fontSize: 8 },
              { text: `${L.footer_revision} 5`, fontSize: 8 },
            ],
            [
              { text: `${L.footer_process} Serviceprocessen`, fontSize: 8 },
              { text: `${L.footer_approved} Susanne Ottosson`, fontSize: 8 },
              { text: `${L.footer_validfrom} 2023-04-11`, fontSize: 8 },
              { text: "", fontSize: 8 },
            ],
        ]
      },
      layout: 'noBorders'
    };
  }
},

    // styles
    styles: {
      title: {
        fontSize: 20,
        bold: true,
      },
      subtitle: {
        fontSize: 11,
        bold: true,
        margin: [0, 10, 0, 3],
      },
      fieldLabel: {
        bold: true,
        margin: [0, 1, 4, 1],
      },
      tableHeader: {
        bold: true,
        fillColor: "#fbbf24",
      },
    },

    images: {
      Logo: logoBase64,
    },
  };
}


// Ladda upp PDF till backend
async function uploadPdfToServer(blob, machineNo, serviceDate, filename) {
  const formData = new FormData();
  formData.append("pdf", blob, filename);
  formData.append("machine_number", machineNo || "");
  formData.append("filename", filename);

  const response = await fetch("/save_pdf_report", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    console.error("Failed to save PDF:", await response.text());
  }
}

// Dynamisk extra rad i spare parts när sista raden fylls
function setupSparePartsAutoRow() {
  const body = document.getElementById("sparePartsBody");

  function onInput() {
    const rows = body.querySelectorAll("tr");
    const lastRow = rows[rows.length - 1];
    const qty = lastRow.querySelector(".sp-qty").value.trim();
    const desc = lastRow.querySelector(".sp-desc").value.trim();
    const item = lastRow.querySelector(".sp-item").value.trim();

    if (qty || desc || item) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" class="sp-qty"></td>
        <td><input type="text" class="sp-desc"></td>
        <td><input type="text" class="sp-item"></td>
      `;
      body.appendChild(tr);
      attachRowListeners(tr);
    }
  }

  function attachRowListeners(tr) {
    tr.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", onInput);
    });
  }

  body.querySelectorAll("tr").forEach((tr) => attachRowListeners(tr));
}

// Init
let logoBase64 = null;

document.addEventListener("DOMContentLoaded", async () => {
  logoBase64 = await loadImageAsBase64("/static/images/apab_logo_512.png");
  
  setLanguage("sv")
  setupSparePartsAutoRow();

  const btn = document.getElementById("downloadPdf");
  btn.addEventListener("click", async () => {
    const data = getFormData();
    const docDefinition = buildDocDefinition(data);

    const machineNo = data.machineNo || "UNKNOWN";
    const date = data.serviceDate || new Date().toISOString().slice(0, 10);
    const filename = `ServiceReport_${machineNo}_${date}.pdf`;

    const pdfDoc = pdfMake.createPdf(docDefinition);

    pdfDoc.getBlob(async (blob) => {
      // 1) spara i databasen
      try {
        await uploadPdfToServer(blob, machineNo, date, filename);
      } catch (e) {
        console.error("Upload error:", e);
      }

      // 2) ladda ner till användaren
      pdfMake.createPdf(docDefinition).download(filename);
    });
  });
});
