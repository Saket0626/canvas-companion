import { CURRENT_PHASE, type PingResponse } from "../shared/messages.js";

const phaseLabel = document.getElementById("phase-label");
const workerStatus = document.getElementById("worker-status");

if (phaseLabel) {
  phaseLabel.textContent = `Phase ${CURRENT_PHASE} scaffold`;
}

chrome.runtime.sendMessage({ type: "PING" }, (response: PingResponse | undefined) => {
  if (chrome.runtime.lastError) {
    if (workerStatus) {
      workerStatus.textContent = "Worker unreachable";
      workerStatus.classList.add("err");
    }
    return;
  }
  if (workerStatus && response?.ok) {
    workerStatus.textContent = `Worker OK · v${chrome.runtime.getManifest().version}`;
    workerStatus.classList.add("ok");
  }
});

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panels = new Map(
  ["calendar", "courses", "chat"].map((id) => [
    id,
    document.getElementById(`panel-${id}`),
  ]),
);

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    if (!target) return;
    for (const other of tabs) {
      other.setAttribute("aria-selected", String(other === tab));
    }
    for (const [id, panel] of panels) {
      if (panel) panel.hidden = id !== target;
    }
  });
}

document.getElementById("chat-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
});
