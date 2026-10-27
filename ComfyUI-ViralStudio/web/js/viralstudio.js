// Acceso a Viral Studio desde ComfyUI: menú superior "Viral Studio", comando
// (paleta de comandos) y un botón flotante siempre visible.
import { app } from "../../scripts/app.js";

const openStudio = () => window.open(new URL("viralstudio/", window.location.href).href, "_blank");

app.registerExtension({
  name: "viralstudio.menu",
  commands: [{ id: "viralstudio.open", label: "Abrir Viral Studio", icon: "pi pi-video", function: openStudio }],
  menuCommands: [{ path: ["Viral Studio"], commands: ["viralstudio.open"] }],
  actionBarButtons: [{ icon: "icon-[lucide--clapperboard]", label: "Viral Studio", tooltip: "Abrir Viral Studio", onClick: openStudio }],
  async setup() {
    if (document.getElementById("vs-open-btn")) return;
    const b = document.createElement("button");
    b.id = "vs-open-btn";
    b.textContent = "🎬 Viral Studio";
    b.title = "Abrir Viral Studio";
    b.onclick = openStudio;
    b.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:9999;background:linear-gradient(135deg,#f0b648,#e3743e);color:#140d06;" +
      "font:700 14px system-ui;border:0;border-radius:999px;padding:10px 16px;box-shadow:0 8px 24px rgba(0,0,0,.45);cursor:pointer";
    document.body.appendChild(b);
  },
});
