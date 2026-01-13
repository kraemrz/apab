const params = new URLSearchParams(window.location.search);
const JSON_PATH = params.get("path");

const container = document.getElementById("inspectionContainer");


if (!JSON_PATH) {
  container.innerHTML = "<p>Ingen inspektionsfil angiven</p>";
  throw new Error("Missing path parameter");
}

async function loadInspection() {
  console.log("Loading inspection from:", JSON_PATH);

  try {
    const res = await fetch(
      `/api/inspection/load?path=${encodeURIComponent(JSON_PATH)}`
    );

    console.log("Fetch status:", res.status);

    if (!res.ok) throw new Error("Failed to load inspection");

    const data = await res.json();
    console.log("Inspection data:", data);

    renderInspection(data);
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Kunde inte ladda inspektionen</p>";
  }
}



function renderInspection(data) {

  const machineDisplay =
    data.machine_name
      ? `${data.machine_name} (${data.machine_number})`
      : data.machine_number;

  container.innerHTML = `
    <h2>${data.customer} – ${machineDisplay}</h2>
    <p><strong>Datum:</strong> ${data.inspection_date}</p>

    ${renderStations(data.comments)}
  `;
}


function renderStations(comments) {
  const grouped = {};

  comments.forEach(c => {
    if (!grouped[c.station]) grouped[c.station] = [];
    grouped[c.station].push(c);
  });

  return Object.entries(grouped).map(([station, rows]) => `
    <h3>${station}</h3>

    <table class="table-grid">
      <colgroup>
        <col class="col-action">
        <col class="col-comment">
      </colgroup>
      <thead>
        <tr>
          <th>Åtgärd</th>
          <th>Kommentar</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.action}</td>
            <td>${r.comment || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("");
}

// 🚀 Start
loadInspection();
