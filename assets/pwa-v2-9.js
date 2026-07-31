let deferredInstallPrompt = null;
let reloadingAfterWorkerUpdate = false;

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

async function registerServiceWorker() {
  const controlledBeforeRegistration = Boolean(navigator.serviceWorker.controller);
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", {
      scope: "./",
      updateViaCache: "none",
    });

    const activateWaitingWorker = () => registration.waiting?.postMessage({type: "SKIP_WAITING"});
    if (registration.waiting) activateWaitingWorker();

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;
      installingWorker.addEventListener("statechange", () => {
        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) activateWaitingWorker();
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!controlledBeforeRegistration || reloadingAfterWorkerUpdate) return;
      reloadingAfterWorkerUpdate = true;
      window.location.reload();
    });

    await registration.update();
  } catch (error) {
    console.error("Service worker não registrado:", error);
  }
}

if ("serviceWorker" in navigator) window.addEventListener("load", registerServiceWorker);
installButton();
