// AutoDrive — Logique client (Firebase, calendrier, réservations, filtres)

import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDyZ-0qmmAJXt9y-q3xGwonixhfvH7lpmU",
  authDomain: "autodrive-dz.firebaseapp.com",
  projectId: "autodrive-dz",
  storageBucket: "autodrive-dz.firebasestorage.app",
  messagingSenderId: "760276133452",
  appId: "1:760276133452:web:0fde5413e7703f1021f6e9"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
let currentCar = null;
let allCars = [];

function carSVG(shape,color) {
  const w="rgba(180,220,255,0.6)";
  if(shape==="suv") return `<svg viewBox="0 0 260 110"><rect x="20" y="38" width="220" height="52" rx="10" fill="${color}"/><rect x="45" y="18" width="160" height="42" rx="8" fill="${color}"/><rect x="60" y="22" width="58" height="30" rx="4" fill="${w}"/><rect x="128" y="22" width="58" height="30" rx="4" fill="${w}"/><circle cx="68" cy="92" r="16" fill="#ccc"/><circle cx="68" cy="92" r="8" fill="#aaa"/><circle cx="192" cy="92" r="16" fill="#ccc"/><circle cx="192" cy="92" r="8" fill="#aaa"/></svg>`;
  if(shape==="luxury") return `<svg viewBox="0 0 280 100"><rect x="15" y="42" width="250" height="44" rx="8" fill="${color}"/><path d="M60 42 Q70 18 110 16 L190 16 Q220 18 230 42Z" fill="${color}"/><rect x="75" y="20" width="55" height="26" rx="3" fill="${w}"/><rect x="140" y="20" width="55" height="26" rx="3" fill="${w}"/><circle cx="72" cy="88" r="14" fill="#ccc"/><circle cx="72" cy="88" r="7" fill="#aaa"/><circle cx="208" cy="88" r="14" fill="#ccc"/><circle cx="208" cy="88" r="7" fill="#aaa"/></svg>`;
  if(shape==="sedan") return `<svg viewBox="0 0 270 100"><rect x="18" y="44" width="234" height="42" rx="8" fill="${color}"/><path d="M55 44 Q65 22 100 20 L185 20 Q215 22 225 44Z" fill="${color}"/><rect x="70" y="23" width="56" height="24" rx="3" fill="${w}"/><rect x="138" y="23" width="56" height="24" rx="3" fill="${w}"/><circle cx="68" cy="88" r="14" fill="#ccc"/><circle cx="68" cy="88" r="7" fill="#aaa"/><circle cx="202" cy="88" r="14" fill="#ccc"/><circle cx="202" cy="88" r="7" fill="#aaa"/></svg>`;
  return `<svg viewBox="0 0 250 100"><rect x="20" y="46" width="210" height="40" rx="8" fill="${color}"/><path d="M52 46 Q60 24 95 22 L168 22 Q200 24 208 46Z" fill="${color}"/><rect x="67" y="25" width="50" height="24" rx="3" fill="${w}"/><rect x="128" y="25" width="50" height="24" rx="3" fill="${w}"/><circle cx="64" cy="88" r="13" fill="#ccc"/><circle cx="64" cy="88" r="6.5" fill="#aaa"/><circle cx="186" cy="88" r="13" fill="#ccc"/><circle cx="186" cy="88" r="6.5" fill="#aaa"/></svg>`;
}

// ── GALLERY ──
function buildGallery(car) {
  const photos = [car.photoURL, car.photoURL2, car.photoURL3].filter(Boolean);
  if (photos.length > 1) {
    const state = { idx: 0 };
    const id = 'gal_' + car.id;
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.dataset.photos = JSON.stringify(photos);
      el.dataset.idx = '0';
    }, 50);
    return `
      <div class="car-image" id="${id}">
        <span class="car-badge">${car.badge||''}</span>
        <img src="${photos[0]}" style="width:100%;height:100%;object-fit:cover;" alt="${car.nom}"/>
        <div class="gallery-nav">
          <button class="gal-btn" onclick="galPrev('${id}',event)">‹</button>
          <button class="gal-btn" onclick="galNext('${id}',event)">›</button>
        </div>
        <div class="gallery-dots">${photos.map((_,i)=>`<div class="gal-dot ${i===0?'active':''}" id="${id}_dot_${i}"></div>`).join('')}</div>
      </div>`;
  }
  return `
    <div class="car-image">
      <span class="car-badge">${car.badge||''}</span>
      ${car.photoURL ? `<img src="${car.photoURL}" style="width:100%;height:100%;object-fit:cover;" alt="${car.nom}"/>` : carSVG(car.forme||'compact',car.couleur||'#2E86DE')}
    </div>`;
}

window.galPrev = (id, e) => { e.stopPropagation(); galGo(id, -1); };
window.galNext = (id, e) => { e.stopPropagation(); galGo(id, 1); };
function galGo(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const photos = JSON.parse(el.dataset.photos || '[]');
  let idx = (parseInt(el.dataset.idx || 0) + dir + photos.length) % photos.length;
  el.dataset.idx = idx;
  el.querySelector('img').src = photos[idx];
  el.querySelectorAll('.gal-dot').forEach((d,i) => d.classList.toggle('active', i === idx));
}

// ── FLEET ──
let currentCategory = 'all', currentBoite = 'all', currentMaxPrix = 999999;
const grid = document.getElementById('carsGrid');

onSnapshot(collection(db,'voitures'), snap => {
  allCars = snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>c.published);
  updateCategories();
  renderCars();
});

function updateCategories() {
  const fromDB = new Set(allCars.map(c=>c.categorie).filter(Boolean));
  const fixed = ['all','Citadine','Berline','SUV','Luxe','Utilitaire'];
  const extra = [...fromDB].filter(c => !fixed.includes(c));
  const cats = [...fixed, ...extra];
  const bar = document.getElementById('catFilters');
  bar.innerHTML = cats.map(c => {
    const label = c==='all'?'Tous':c;
    const count = c==='all'?allCars.length:allCars.filter(v=>v.categorie===c).length;
    const hasCount = c!=='all';
    return `<button class="filter-pill ${c===currentCategory?'active':''}" onclick="setCat('${c}')">
      ${label}${hasCount&&count>0?` <span style="font-size:.65rem;opacity:.75;">(${count})</span>`:''}
    </button>`;
  }).join('');
}

window.setCat = (c) => { currentCategory = c; document.querySelectorAll('.filter-pill').forEach(b=>b.classList.toggle('active', b.textContent===(c==='all'?'Tous':c))); renderCars(); };
window.setBoite = (v) => { currentBoite = v; renderCars(); };
window.setPrix = (v) => { currentMaxPrix = parseInt(v); document.getElementById('prixLabel').textContent = parseInt(v).toLocaleString('fr-DZ') + ' DA'; renderCars(); };

function renderCars() {
  let cars = allCars;
  if (currentCategory !== 'all') cars = cars.filter(c => c.categorie === currentCategory);
  if (currentBoite !== 'all') cars = cars.filter(c => c.boite === currentBoite);
  cars = cars.filter(c => (c.prix||0) <= currentMaxPrix);
  grid.innerHTML = '';
  if (!cars.length) { grid.innerHTML='<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:40px">Aucun véhicule correspond à vos filtres.</p>'; return; }
  cars.forEach(car => {
    const card = document.createElement('div');
    card.className='car-card';
    card.innerHTML=`
      ${buildGallery(car)}
      <div class="car-info">
        <div class="car-category">${car.categorie||''}</div>
        <div class="car-name">${car.nom||''}</div>
        <div class="car-specs"><span>🪑 ${car.places||5}</span><span>⛽ ${car.carburant||''}</span><span>⚙️ ${car.boite||''}</span></div>
        <div class="car-footer">
          <div class="car-price">${(car.prix||0).toLocaleString('fr-DZ')} DA<small> /jour</small></div>
          <button class="btn-reserve" onclick="window.openModal('${car.nom}',${car.prix})">Réserver →</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ── MODAL ──
let unsubBlocked = null;
window.openModal = (name,price) => {
  currentCar={name,price};
  document.getElementById('modalCarName').textContent=name;
  document.getElementById('modalCarPrice').textContent=`${price.toLocaleString('fr-DZ')} DA / jour`;
  document.getElementById('priceCalc').classList.remove('show');
  document.getElementById('modal').classList.add('open');
  if(unsubBlocked) unsubBlocked();
  try{
    unsubBlocked = onSnapshot(
      query(collection(db,'reservations'),where('voiture','==',name),where('statut','==','confirmed')),
      snap => {
        const blocked = snap.docs.map(d=>({debut:d.data().debut,fin:d.data().fin}));
        calBlockedRanges = blocked;
        renderCal();
      }
    );
    calInit([]);
  } catch(e){ calInit([]); }
};
window.closeModal = () => {
  document.getElementById('modal').classList.remove('open');
  calStart=null; calEnd=null;
  if(unsubBlocked){ unsubBlocked(); unsubBlocked=null; }
};
document.getElementById('modal').addEventListener('click',e=>{if(e.target===e.currentTarget)window.closeModal();});

window.confirmReservation = async () => {
  const nom=document.getElementById('resNom').value.trim();
  const tel=document.getElementById('resTel').value.trim();
  const debut=document.getElementById('resDebut').value;
  const fin=document.getElementById('resFin').value;
  const ville=document.getElementById('resVille').value;
  const villeRetour=document.getElementById('resVilleRetour').value;
  if(!nom||!tel||!debut||!fin||!ville||!villeRetour){alert('Veuillez remplir tous les champs.');return;}
  const btn=document.getElementById('btnConfirm');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Vérification…';
  try {
    const conflit = calBlockedRanges.some(r => debut <= r.fin && fin >= r.debut);
    if(conflit){
      btn.disabled=false;btn.innerHTML='Confirmer la Réservation';
      const periodes = calBlockedRanges
        .filter(r => debut <= r.fin && fin >= r.debut)
        .map(r=>`Du <strong>${formatDate(r.debut)}</strong> au <strong>${formatDate(r.fin)}</strong>`)
        .join('<br>');
      showUnavailable(periodes); return;
    }
  } catch(e){ console.error(e); }
  btn.innerHTML='<span class="spinner"></span> Envoi…';
  const days=Math.max(1,Math.ceil((new Date(fin)-new Date(debut))/(1000*60*60*24)));
  try {
    await addDoc(collection(db,'reservations'),{nom,tel,voiture:currentCar.name,prixJour:currentCar.price,debut,fin,heureDepart:document.getElementById('resHeureDepart').value,heureRetour:document.getElementById('resHeureRetour').value,jours:days,total:currentCar.price*days,ville,villeRetour,statut:'pending',createdAt:serverTimestamp()});
    window.closeModal();
    const t=document.getElementById('toast');t.textContent='✅ Réservation envoyée avec succès !';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
    ['resNom','resTel','resVille','resVilleRetour'].forEach(id=>document.getElementById(id).value='');
  } catch(e){alert('Erreur : '+e.message);}
  btn.disabled=false;btn.innerHTML='Confirmer la Réservation';
};

function formatDate(d){ if(!d)return''; const[y,m,day]=d.split('-'); return`${day}/${m}/${y}`; }
function showUnavailable(periodes=''){
  const el=document.getElementById('unavailableMsg');
  document.getElementById('unavailablePeriodes').innerHTML=periodes?`Périodes déjà réservées :<br>${periodes}`:"Choisissez d'autres dates.";
  el.style.display='flex';
}

function updatePriceCalc() {
  if (!calStart || !calEnd || !currentCar) { document.getElementById('priceCalc').classList.remove('show'); return; }
  const days = Math.max(1, Math.ceil((new Date(calEnd)-new Date(calStart))/(1000*60*60*24)));
  const total = days * currentCar.price;
  document.getElementById('calcDays').textContent = `${days} jour${days>1?'s':''} × ${currentCar.price.toLocaleString('fr-DZ')} DA`;
  document.getElementById('calcTotal').textContent = total.toLocaleString('fr-DZ');
  document.getElementById('priceCalc').classList.add('show');
}

// ── POLITIQUE ──
window.openPolitique = () => document.getElementById('politiqueModal').classList.add('open');
window.closePolitique = () => document.getElementById('politiqueModal').classList.remove('open');

// ── CALENDAR ──
let calYear,calMonth,calBlockedRanges=[],calStart=null,calEnd=null;
const MONTHS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DOWS=['Lu','Ma','Me','Je','Ve','Sa','Di'];
function calInit(blocked=[]){ calBlockedRanges=blocked; calStart=null; calEnd=null; document.getElementById('resDebut').value=''; document.getElementById('resFin').value=''; document.getElementById('calInfo').textContent='Cliquez sur une date de début puis de fin'; document.getElementById('unavailableMsg').style.display='none'; document.getElementById('priceCalc').classList.remove('show'); const now=new Date(); calYear=now.getFullYear(); calMonth=now.getMonth(); renderCal(); }
function calPrev(){ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCal(); }
function calNext(){ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCal(); }
window.calPrev=calPrev; window.calNext=calNext;
function toStr(y,m,d){ return`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function isBlocked(ds){ return calBlockedRanges.some(r=>ds>=r.debut&&ds<=r.fin); }
function isPast(ds){ return ds<new Date().toISOString().split('T')[0]; }
function renderCal(){
  document.getElementById('calMonthLabel').textContent=`${MONTHS[calMonth]} ${calYear}`;
  document.getElementById('calDows').innerHTML=DOWS.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  const firstDay=(new Date(calYear,calMonth,1).getDay()+6)%7;
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  let html='';
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const ds=toStr(calYear,calMonth,d); const blocked=isBlocked(ds); const past=isPast(ds);
    let cls='cal-day';
    if(past) cls+=' past';
    else if(blocked){ cls+=' blocked'; const prev=toStr(calYear,calMonth,d-1); const next=toStr(calYear,calMonth,d+1); if(!isBlocked(prev)&&!isBlocked(next)) cls+=' blocked-single'; else if(!isBlocked(prev)) cls+=' blocked-start'; else if(!isBlocked(next)) cls+=' blocked-end'; }
    else { if(calStart&&calEnd){ if(ds===calStart&&ds===calEnd) cls+=' selected-single'; else if(ds===calStart) cls+=' selected-start'; else if(ds===calEnd) cls+=' selected-end'; else if(ds>calStart&&ds<calEnd) cls+=' selected-range'; } else if(calStart&&ds===calStart) cls+=' selected-single'; }
    const click=(!blocked&&!past)?`onclick="calClick('${ds}')"`:'' ;
    html+=`<div class="${cls}" ${click}>${d}</div>`;
  }
  document.getElementById('calDays').innerHTML=html;
}
function calClick(ds){
  if(!calStart||(calStart&&calEnd)){ calStart=ds; calEnd=null; document.getElementById('resDebut').value=ds; document.getElementById('resFin').value=''; document.getElementById('calInfo').textContent=`Début : ${formatDate(ds)} — Choisissez la date de fin`; document.getElementById('priceCalc').classList.remove('show'); }
  else { if(ds<calStart){calEnd=calStart;calStart=ds;}else calEnd=ds; let cur=new Date(calStart); const endD=new Date(calEnd); let hasBlock=false; while(cur<=endD){const s=cur.toISOString().split('T')[0];if(isBlocked(s)){hasBlock=true;break;}cur.setDate(cur.getDate()+1);} if(hasBlock){ document.getElementById('calInfo').textContent="⚠️ Période indisponible."; calEnd=null; document.getElementById('resFin').value=''; document.getElementById('priceCalc').classList.remove('show'); } else{ document.getElementById('resDebut').value=calStart; document.getElementById('resFin').value=calEnd; document.getElementById('calInfo').textContent=`✅ Du ${formatDate(calStart)} au ${formatDate(calEnd)}`; updatePriceCalc(); } }
  renderCal();
}
window.calClick=calClick;

// ── SCROLL ANIMATIONS ──
function revealOnScroll() {
  const reveals = document.querySelectorAll('.feature, .condition-card');
  reveals.forEach(el => {
    const windowHeight = window.innerHeight;
    const elementTop = el.getBoundingClientRect().top;
    const revealPoint = 120;
    if (elementTop < windowHeight - revealPoint) {
      el.classList.add('visible');
    }
  });
}
window.addEventListener('scroll', revealOnScroll);
window.addEventListener('load', () => {
  revealOnScroll();
  // Init calendar
  calInit([]);
});

// Init dates
const today=new Date().toISOString().split('T')[0];
const next3=new Date(Date.now()+86400000*3).toISOString().split('T')[0];
document.getElementById('heroDateStart').value=today;
document.getElementById('heroDateEnd').value=next3;
document.getElementById('politiqueModal').addEventListener('click',e=>{if(e.target===e.currentTarget)window.closePolitique();});
