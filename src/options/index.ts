import { CURRENT_PHASE } from "../shared/messages.js";

const phaseLabel = document.getElementById("phase-label");
if (phaseLabel) {
  phaseLabel.textContent = `Phase ${CURRENT_PHASE} scaffold — fields are visual only`;
}

const connectBtn = document.getElementById("connect-btn");
const connectStatus = document.getElementById("connect-status");

connectBtn?.addEventListener("click", () => {
  if (connectStatus) {
    connectStatus.textContent =
      "Connect is not wired yet. Phase 1 will request a host permission for the domain you enter.";
  }
});
