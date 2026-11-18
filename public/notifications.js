/* Suscripción opcional por dispositivo. Nunca envía importes ni nombres de jugadores. */
(() => {
  const API = 'https://fieldnote-push.jhmoreno273.workers.dev';
  const panel = document.createElement('section');
  panel.className = 'settings-demo';
  panel.innerHTML = `<h3 class="settings-section-heading">Notificaciones</h3>
    <p>Recibe un aviso antes del partido y al terminar, incluso con Fieldnote cerrada. Al activar, se guardan en Cloudflare la suscripción de este dispositivo y los identificadores de tus partidos durante 90 días desde la última sincronización.</p>
    <p id="push-status" role="status" aria-live="polite">Comprobando disponibilidad…</p>
    <div class="push-actions"><button type="button" id="push-enable" class="primary">Activar notificaciones</button>
    <button type="button" id="push-test" class="secondary" hidden>Enviar prueba en 10 segundos</button>
    <button type="button" id="push-disable" class="secondary" hidden>Desactivar</button></div>`;
  document.querySelector('#backup-dialog .settings-demo').before(panel);
  const status=panel.querySelector('#push-status'), enable=panel.querySelector('#push-enable'),
    test=panel.querySelector('#push-test'), disable=panel.querySelector('#push-disable');
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const installed=matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let registration, subscription, token=localStorage.getItem('fieldnote-push-token'), signature='', syncing=false;
  if(!token) { token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''); localStorage.setItem('fieldnote-push-token',token); }
  async function api(path, method='POST', body) {
    const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const data=await r.json(); if(!r.ok) throw Error(data.error || 'No se pudo conectar con las notificaciones.'); return data;
  }
  function events() {
    try { return [...new Set(JSON.parse(localStorage.getItem('fieldnote-v1') || '[]').flatMap(p=>(p.legs || []).map(l=>String(l.event))))].filter(id=>/^\d{1,12}$/.test(id)).slice(0,40); }
    catch {return [];}
  }
  async function sync(force=false) {
    if(!subscription || syncing) return;
    const ids=events(), next=JSON.stringify(ids);
    if(!force && signature===next) return;
    syncing=true;
    try {await api('/subscription','POST',{subscription:subscription.toJSON(),events:ids}); signature=next; status.textContent='Activadas · '+ids.length+' partidos sincronizados. Los avisos dependen de la disponibilidad de ESPN.';}
    finally {syncing=false;}
  }
  function buttons(on) {enable.hidden=on;test.hidden=!on;disable.hidden=!on;}
  function error(e) {status.textContent=e.message || 'No se pudo activar. Intenta de nuevo.';}
  enable.onclick=async()=>{
    enable.disabled=true;
    try {
      // Se solicita directamente desde el toque para respetar el permiso de iOS.
      const permission=await Notification.requestPermission();
      if(permission!=='granted') throw Error('Permiso no concedido. Puedes cambiarlo en Ajustes → Notificaciones → Fieldnote.');
      registration=await navigator.serviceWorker.ready;
      const config=await api('/config','GET');
      const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));
      subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});
      await sync(true);buttons(true);
    } catch(e) {error(e);} finally {enable.disabled=false;}
  };
  test.onclick=async()=>{
    test.disabled=true;
    try {
      await sync(true);await api('/test');
      status.textContent='Prueba programada. Bloquea tu iPhone: se enviará en unos 10 segundos.';
      let attempts=0;
      const timer=setInterval(async()=>{
        try {
          const result=await api('/test-status','GET');
          if(result.delivery?.state==='accepted') {
            status.textContent='El servicio de notificaciones aceptó la prueba. Si no aparece, revisa los avisos de Fieldnote y el modo Concentración en Ajustes del iPhone.';
          } else if(result.delivery?.state==='failed') {
            status.textContent=[404,410].includes(result.delivery.code)?'La suscripción venció. Pulsa Desactivar y vuelve a activar las notificaciones.':'No se pudo enviar la prueba. Intenta nuevamente; si continúa, indica este código: '+result.delivery.code;
          } else if(++attempts<20) return;
          else status.textContent='Todavía no se confirmó el envío. Intenta otra prueba en unos segundos.';
        } catch(e) {error(e);}
        clearInterval(timer);test.disabled=false;
      },2000);
    } catch(e) {error(e);test.disabled=false;}
  };
  disable.onclick=async()=>{disable.disabled=true;try{await api('/subscription','DELETE');if(subscription)await subscription.unsubscribe();subscription=null;signature='';buttons(false);status.textContent='Desactivadas. Se borró la suscripción del servidor.';}catch(e){error(e);}finally{disable.disabled=false;}};
  async function init() {
    if(ios && !installed) {enable.disabled=true;status.textContent='En iPhone: abre esta página en Safari → Compartir → Agregar a pantalla de inicio. Después abre Fieldnote desde su icono.';return;}
    if(!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {enable.disabled=true;status.textContent='Este navegador no admite notificaciones. Usa un navegador compatible; en iPhone necesitas iOS 16.4 o posterior.';return;}
    registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
    registration=await navigator.serviceWorker.ready;
    subscription=await registration.pushManager.getSubscription();buttons(!!subscription);
    status.textContent=Notification.permission==='denied'?'Permiso bloqueado. Revisa Ajustes → Notificaciones → Fieldnote.':'Activa los avisos para este dispositivo.';
    if(subscription) await sync(true);
    setInterval(()=>sync().catch(error),15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync(true).catch(error);});
    window.addEventListener('storage',()=>sync().catch(error));
    window.addEventListener('fieldnote-saved',()=>sync().catch(error));
  }
  init().catch(error);
})();

