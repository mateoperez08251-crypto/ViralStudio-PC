/* Solo coordina la interfaz local. Ninguna llave remota se incluye en peticiones del navegador. */
(() => {
  'use strict';
  const nativeFetch=window.fetch.bind(window), pending=new Map();
  const el=id=>document.getElementById(id);
  let profile=sessionStorage.getItem('vs_pc_profile')||'', automatic=sessionStorage.getItem('vs_pc_auto')!=='0';
  window.fetch=async function(input,opts={}) {
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    const method=(opts.method||'GET').toUpperCase();
    if(url.origin===location.origin && url.pathname==='/viralstudio/api/projects' && method==='POST') {
      const body=String(opts.body||''), identity=body+'\n'+profile+'\n'+automatic;
      let key=pending.get(identity);
      if(!key){key=crypto.randomUUID();pending.set(identity,key);}
      const headers=new Headers(opts.headers||{});
      if(!headers.has('Idempotency-Key'))headers.set('Idempotency-Key',key);
      headers.set('X-ViralStudio-Guide',profile);headers.set('X-ViralStudio-Auto',automatic?'1':'0');
      const response=await nativeFetch(input,{...opts,headers});
      if(response.ok || (response.status>=400 && response.status<500))pending.delete(identity);
      return response;
    }
    return nativeFetch(input,opts);
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path,body){
    const r=await nativeFetch('/pc/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const d=await r.json();if(!r.ok)throw Error(d.error||r.statusText);return d;
  }
  const say=(s,bad=false)=>{el('pcMessage').textContent=s;el('pcMessage').style.color=bad?'#ff8c8c':'#9fdbb0';};
  let state={guides:[],jobs:[]};
  window.VSActiveGuide=()=>state.guides.find(g=>g.profile===profile)||null;
  async function refresh(){
    state=await api('state');
    if(document.activeElement!==el('pcUrl') && !el('pcUrl').value)el('pcUrl').value=state.url;
    el('pcAutoDownload').checked=state.auto_download;
    el('pcFolder').textContent=state.folder;
    el('pcProfile').innerHTML='<option value="">Sin guía adicional</option>'+state.guides.map(g=>`<option value="${esc(g.profile)}">${esc(g.title)} · ${g.sha256.slice(0,8)}</option>`).join('');
    el('pcProfile').value=profile;
    el('pcJobs').innerHTML=state.jobs.slice(0,60).map(j=>`<tr><td>${j.id.slice(0,8)}</td><td>${esc(j.state)}</td><td>${j.remote_id?`<a href="#/p/${encodeURIComponent(j.remote_id)}">Abrir proyecto</a>`:'Pendiente de enviar'}</td><td>${esc(j.error||j.result)}</td><td>${!j.remote_id&&['en_cola','esperando_conexion'].includes(j.state)?`<button data-cancel="${j.id}">Retirar</button>`:''}</td></tr>`).join('');
    if(state.connection_error)say(state.connection_error,true);
  }
  async function act(fn){try{await fn();}catch(e){say(e.message,true);}}
  document.addEventListener('DOMContentLoaded',()=>{
    const panelStyles=document.createElement('style');
    panelStyles.textContent=`
      #pcPanel { color-scheme: dark; }
      #pcPanel input:not([type="checkbox"]), #pcPanel textarea, #pcPanel select {
        background: #0b1220; color: #e6edf3; caret-color: #e6edf3;
        border: 1px solid #64748b; border-radius: 8px; padding: 9px 11px;
        box-sizing: border-box; max-width: 100%;
      }
      #pcPanel input::placeholder, #pcPanel textarea::placeholder { color: #aab8ca; opacity: 1; }
      #pcPanel select option { background: #0b1220; color: #e6edf3; }
      #pcPanel button, #pcPanel input::file-selector-button {
        background: #f0b648; color: #111827; border: 1px solid #f0b648;
        border-radius: 8px; padding: 9px 12px; font-weight: 700; cursor: pointer;
      }
      #pcPanel button:hover, #pcPanel input::file-selector-button:hover { background: #ffcc70; }
      #pcPanel input::file-selector-button { margin-right: 10px; }
      #pcPanel input[type="checkbox"] { accent-color: #f0b648; }
      #pcPanel :is(input, textarea, select, button):focus-visible {
        outline: 2px solid #7dd3fc; outline-offset: 3px;
      }
      #pcPanel input:-webkit-autofill {
        -webkit-text-fill-color: #e6edf3; caret-color: #e6edf3;
        box-shadow: 0 0 0 1000px #0b1220 inset;
      }
      #pcPanel button:disabled { background: #334155; color: #cbd5e1; border-color: #64748b; cursor: not-allowed; }
    `;
    document.head.appendChild(panelStyles);
    const panel=document.createElement('details');panel.id='pcPanel';panel.open=false;
    panel.style.cssText='margin:12px;padding:16px;border:1px solid #455367;border-radius:12px;background:#141c28;color:#e6edf3;font:14px system-ui';
    panel.innerHTML=`<summary style="cursor:pointer;font-weight:700">ViralStudio PC · Colab y guías de animación</summary>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px"><label>URL HTTPS de Cloudflare <input id="pcUrl" type="url" size="44" placeholder="https://….trycloudflare.com"></label><label>Llave de Colab <input id="pcKey" type="password" autocomplete="off" placeholder="Vacío conserva la llave guardada"></label><button id="pcConnect">Guardar conexión</button><button id="pcCheck">Comprobar motor</button></div>
    <p><label>Guía para nuevos proyectos <select id="pcProfile"></select></label> <label><input id="pcAutomatic" type="checkbox"> Procesar hasta el video final automáticamente</label> <label><input id="pcAutoDownload" type="checkbox" checked> Descargar resultados a la PC</label></p>
    <p>La interfaz y las guías se guardan en esta PC; Qwen, voces y render se ejecutan en Colab. Los controles de coherencia siguen activos, con hasta dos correcciones automáticas por trabajo. Si el error persiste se detiene para revisión. Un revisor visual distinto de Qwen 27B inspecciona tres fotogramas por escena y usa la anterior como referencia. Si falla o no puede revisar, no se da por aprobado. Una guía no añade acciones que el motor no sabe dibujar.</p>
    <details><summary>Guardar guías .md por tipo de animación</summary><p><label>Identificador <input id="pcGuideId" maxlength="64" placeholder="ej.: documental_animales"></label> <label>Nombre <input id="pcGuideTitle" maxlength="100" placeholder="Documental de animales"></label> <input id="pcGuideFiles" type="file" accept=".md,text/markdown" multiple> <button id="pcLoadGuide">Editar guía seleccionada</button></p><textarea id="pcMarkdown" rows="9" style="width:100%;box-sizing:border-box" placeholder="Personajes, aspecto, escenarios, paleta, acciones y reglas de continuidad. Máximo 24 KiB en total."></textarea><button id="pcSaveGuide">Guardar guía en esta PC</button><p>Se envía una copia con huella SHA-256 a cada proyecto nuevo. Cambiar una guía no altera proyectos anteriores. Todas las llamadas de texto de ese proyecto reciben su guía.</p></details>
    <details><summary>Cola automática de guiones o temas</summary><p><select id="pcBatchMode"><option value="script">Guiones completos</option><option value="topic">Temas para desarrollar</option></select> <label>Duración orientativa (s) <input id="pcBatchDuration" type="number" min="10" max="3600" value="60"></label></p><textarea id="pcBatch" rows="5" style="width:100%" placeholder="Un guion o tema por bloque. Separa los bloques con una línea que contenga solo ---"></textarea><button id="pcEnqueue">Guardar lote en la cola de la PC</button><p>Los lotes usan la guía seleccionada, formato vertical y música desactivada. Para otros ajustes utiliza el formulario original de Crear. Colab debe estar activo para procesarlos; si se desconecta, lo pendiente permanece aquí.</p></details>
    <p id="pcMessage" role="status"></p><small>Carpeta de datos y resultados: <span id="pcFolder"></span></small>
    <details><summary>Cola y descargas de esta PC</summary><button id="pcRefresh">Actualizar</button><table style="width:100%;text-align:left"><thead><tr><th>Solicitud</th><th>Estado</th><th>Proyecto</th><th>Detalle</th><th></th></tr></thead><tbody id="pcJobs"></tbody></table></details>`;
    document.querySelector('header').after(panel);el('pcAutomatic').checked=automatic;
    const notice=document.createElement('p');notice.id='pcConnectionNotice';notice.style.cssText='margin:8px 16px;color:#aab4c4;font:14px system-ui';notice.textContent='Crea tu video abajo con los formularios originales. Abre «Colab y guías de animación» para conectar el motor antes de generar.';panel.after(notice);
    el('pcProfile').onchange=()=>{profile=el('pcProfile').value;sessionStorage.setItem('vs_pc_profile',profile);};
    el('pcAutomatic').onchange=()=>{automatic=el('pcAutomatic').checked;sessionStorage.setItem('vs_pc_auto',automatic?'1':'0');};
    el('pcConnect').onclick=()=>act(async()=>{await api('connection',{url:el('pcUrl').value,token:el('pcKey').value,auto_download:el('pcAutoDownload').checked});el('pcKey').value='';say('Conexión guardada. Comprueba el motor; recarga la página para cargar sus opciones.');await refresh();});
    el('pcAutoDownload').onchange=()=>act(async()=>{await api('connection',{url:el('pcUrl').value,auto_download:el('pcAutoDownload').checked});});
    el('pcCheck').onclick=()=>act(async()=>{const d=await api('check',{});say(d.detail+' Si la interfaz estaba desconectada, recarga esta página.');});
    el('pcGuideFiles').onchange=()=>act(async()=>{const files=[...el('pcGuideFiles').files];if(files.some(f=>!f.name.toLowerCase().endsWith('.md')))throw Error('Solo archivos .md.');if(files.reduce((n,f)=>n+f.size,0)>24*1024)throw Error('Las guías suman más de 24 KiB.');el('pcMarkdown').value=(await Promise.all(files.map(async f=>'# '+f.name+'\n\n'+await f.text()))).join('\n\n');});
    el('pcSaveGuide').onclick=()=>act(async()=>{const d=await api('guides',{profile:el('pcGuideId').value.trim(),title:el('pcGuideTitle').value.trim(),markdown:el('pcMarkdown').value});profile=d.profile;sessionStorage.setItem('vs_pc_profile',profile);await refresh();say('Guía guardada. Se aplicará a los nuevos proyectos de este tipo.');});
    el('pcLoadGuide').onclick=()=>{const g=state.guides.find(g=>g.profile===profile);if(!g)return say('Selecciona primero una guía.',true);el('pcGuideId').value=g.profile;el('pcGuideTitle').value=g.title;el('pcMarkdown').value=g.markdown;};
    el('pcEnqueue').onclick=()=>act(async()=>{const items=el('pcBatch').value.split(/^\s*---\s*$/m).map(s=>s.trim()).filter(Boolean);const d=await api('batch',{items,mode:el('pcBatchMode').value,duration:Number(el('pcBatchDuration').value),profile});el('pcBatch').value='';say(d.ids.length+' trabajos guardados en la cola de la PC.');await refresh();});
    el('pcJobs').onclick=e=>{if(e.target.dataset.cancel)act(async()=>{await api('jobs/'+e.target.dataset.cancel+'/cancel',{});await refresh();});};
    el('pcRefresh').onclick=()=>act(refresh);
    act(refresh);setInterval(()=>act(refresh),10000);
  });
})();
