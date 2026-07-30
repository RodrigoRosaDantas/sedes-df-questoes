let deferredInstallPrompt = null;

function installButton() {
  let button = document.querySelector("#install-app");
  if (button) return button;
  const actions = document.querySelector(".top-actions");
  if (!actions) return null;
  button = document.createElement("button");
  button.id = "install-app";
  button.className = "icon-btn";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-label", "Instalar aplicativo para uso offline");
  button.textContent = "⇩";
  actions.prepend(button);
  button.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    button.hidden = true;
  });
  return button;
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = installButton();
  if (button) button.hidden = false;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = installButton();
  if (button) button.hidden = true;
});
window.addEventListener("offline", () => document.documentElement.dataset.offline = "true");
window.addEventListener("online", () => delete document.documentElement.dataset.offline);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js", {scope: "./"}).catch(error => console.error("Service worker não registrado:", error)));
}
installButton();
