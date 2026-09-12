// ============================================================================
// الكافل — منصة التبرعات
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateEmail, updatePassword, updateProfile,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBuJRFfCDY-6XysQH-ykGCRk5iA09D99HA",
  authDomain: "alkfel-f32cd.firebaseapp.com",
  projectId: "alkfel-f32cd",
  storageBucket: "alkfel-f32cd.firebasestorage.app",
  messagingSenderId: "431381621958",
  appId: "1:431381621958:web:8e9ff7ab0964f2b9683bc7"
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

const OWNER_EMAIL = "mslmalmyaly223@gmail.com";

// ---------------------------------------------------------------------------
// Small state / cache layer (built to minimize Firestore reads)
// ---------------------------------------------------------------------------
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for campaigns/payment methods
const S = {
  user: null,        // firebase auth user
  profile: null,      // users/{uid} doc data
  isOwner: false,
  campaigns: [],
  paymentMethods: [],
  myDonations: [],
  notifications: [],
  unreadNotif: false,
  pendingAdminCount: 0,
  lang: localStorage.getItem('kafel_lang') || 'ar',
  theme: localStorage.getItem('kafel_theme') || 'light',
};
let notifUnsub = null, pendingUnsub = null;

applyTheme(S.theme);

function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  S.theme = t;
  localStorage.setItem('kafel_theme', t);
}

const I18N = {
  ar: { dir:'rtl', home:'الرئيسية', campaigns:'حملات التبرع', settings:'الإعدادات' },
  en: { dir:'ltr', home:'Home', campaigns:'Campaigns', settings:'Settings' },
  ku: { dir:'rtl', home:'سەرەکی', campaigns:'کەمپینەکان', settings:'ڕێکخستنەکان' },
};
function applyLang(l){
  S.lang = l; localStorage.setItem('kafel_lang', l);
  document.documentElement.lang = l;
  document.documentElement.dir = I18N[l]?.dir || 'rtl';
}
applyLang(S.lang);

// ---------------------------------------------------------------------------
// Icons (inline SVG, currentColor)
// ---------------------------------------------------------------------------
const ic = {
  home:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
  heart:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.9-10-9.3C.4 8.1 2 4.5 5.6 3.7 8 3.1 10.3 4.2 12 6.4 13.7 4.2 16 3.1 18.4 3.7 22 4.5 23.6 8.1 22 11.7 19.5 16.1 12 21 12 21z"/></svg>`,
  gear:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3.5h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1c.5.4 1.1.75 1.7 1l.3 2.6h4l.3-2.6c.6-.25 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.5z"/></svg>`,
  bell:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>`,
  back:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>`,
  chev:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>`,
  x:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  google:`<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 35.5 24 35.5c-6.9 0-12.5-5.6-12.5-12.5S17.1 10.5 24 10.5c3.2 0 6 1.2 8.2 3.1l5.7-5.7C34.6 4.9 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.2 0 6 1.2 8.2 3.1l5.7-5.7C34.6 6.9 29.6 5 24 5c-7.6 0-14.1 4.3-17.7 10.6z"/><path fill="#4CAF50" d="M24 45c5.4 0 10.4-1.9 14.2-5.1l-6.5-5.5c-2 1.5-4.7 2.6-7.7 2.6-5.3 0-9.7-3-11.4-7.4l-6.6 5C9.8 40.5 16.4 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.5 5.5C40.5 36.6 45 30.9 45 24c0-1.2-.1-2.3-.4-3.5z"/></svg>`,
  wallet:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14.5h2"/></svg>`,
  gift:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18"/><path d="M12 8c-2 0-3.5-1.5-3.5-3S9 2 10.5 2 12 4.5 12 8Zm0 0c2 0 3.5-1.5 3.5-3S14 2 12.5 2 12 4.5 12 8Z"/></svg>`,
  hand:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11.5V6a1.5 1.5 0 0 1 3 0v9"/><path d="M8 12l-1.5-1.5a1.6 1.6 0 0 0-2.3 2.2L8 17c1.3 1.3 2.6 2 5 2h1a6 6 0 0 0 6-6V9"/></svg>`,
  camera:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  user:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>`,
  mail:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>`,
  phone:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2L21 15v3a2 2 0 0 1-2 2C10.5 20 4 13.5 4 5a2 2 0 0 1 2-2z"/></svg>`,
  globe:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>`,
  moon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>`,
  shield:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>`,
  logout:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  plus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  dots:`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>`,
  copy:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  edit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13"/></svg>`,
  card:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.2"/><path d="M2.5 9.5h19"/></svg>`,
  inbox:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7z"/></svg>`,
};

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove('show'), 2400);
}
function fmtMoney(n){
  n = Number(n)||0;
  return n.toLocaleString('en-US');
}
function esc(s){
  return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function timeAgo(ts){
  if(!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime())/1000);
  if(s<60) return 'الآن';
  if(s<3600) return `منذ ${Math.floor(s/60)} د`;
  if(s<86400) return `منذ ${Math.floor(s/3600)} س`;
  return `منذ ${Math.floor(s/86400)} يوم`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const screenEl = document.getElementById('screen');
let stack = []; // {name, params}

function navigate(name, params={}, replace=false){
  if(replace) stack[stack.length-1] = {name, params};
  else stack.push({name, params});
  render();
  window.scrollTo(0,0);
}
function goBack(){
  if(stack.length>1){ stack.pop(); render(); }
}
function resetTo(name, params={}){
  stack = [{name, params}];
  render();
}
window.addEventListener('popstate', ()=>{ goBack(); });

function render(){
  const {name, params} = stack[stack.length-1];
  const fn = PAGES[name];
  if(!fn){ screenEl.innerHTML = '<div class="center-msg">صفحة غير موجودة</div>'; return; }
  screenEl.innerHTML = fn(params) || '';
  bindPage(name, params);
}
const PAGES = {};
const BINDERS = {};
function definePage(name, renderFn, bindFn){ PAGES[name]=renderFn; if(bindFn) BINDERS[name]=bindFn; }
function bindPage(name, params){ if(BINDERS[name]) BINDERS[name](params); bindGlobalTabbar(name); }

function topbar(title){
  return `<div class="topbar"><button class="back" data-act="back">${ic.back}</button><h2>${esc(title)}</h2></div>`;
}
function tabbar(active){
  const t = [
    {k:'home', label:I18N[S.lang].home, i:ic.home},
    {k:'campaigns-tab', label:I18N[S.lang].campaigns, i:ic.heart},
    {k:'settings', label:I18N[S.lang].settings, i:ic.gear},
  ];
  return `<div class="tabbar">${t.map(x=>`
    <button class="tab-item ${active===x.k?'active':''}" data-tab="${x.k}">${x.i}<span>${x.label}</span></button>
  `).join('')}</div>`;
}
// data-tab = bottom tab bar (resets the navigation stack)
// data-nav = a regular forward push, bound per-page via wireTabNav()
// data-act="back" = the top bar back button
function bindGlobalTabbar(){
  document.querySelectorAll('[data-tab]').forEach(b=>{
    b.onclick = ()=> resetTo(b.getAttribute('data-tab'));
  });
  document.querySelectorAll('[data-act="back"]').forEach(b=> b.onclick = goBack);
}

function modal({icon=ic.heart, title, text, okText='حسنًا', onOk, cancelText, onCancel}){
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal-box">
    <div class="ic">${icon}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text||'')}</p>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button class="btn" id="m-ok">${esc(okText)}</button>
      ${cancelText?`<button class="btn secondary" id="m-cancel">${esc(cancelText)}</button>`:''}
    </div>
  </div>`;
  document.body.appendChild(back);
  back.querySelector('#m-ok').onclick = ()=>{ back.remove(); onOk && onOk(); };
  if(cancelText) back.querySelector('#m-cancel').onclick = ()=>{ back.remove(); onCancel && onCancel(); };
  back.onclick = (e)=>{ if(e.target===back){ back.remove(); onCancel && onCancel(); } };
}
function actionSheet(items){
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="frame"><div class="sheet"><div class="grabber"></div>
    ${items.map((it,idx)=>`<div class="sheet-item ${it.danger?'danger':''}" data-i="${idx}">${it.icon||''}<span>${esc(it.label)}</span></div>`).join('')}
  </div></div>`;
  document.body.appendChild(back);
  back.querySelectorAll('.sheet-item').forEach(el=>{
    el.onclick = ()=>{ back.remove(); items[+el.dataset.i].onClick(); };
  });
  back.onclick = (e)=>{ if(e.target===back) back.remove(); };
}

// ---------------------------------------------------------------------------
// Data layer — cached reads to keep Firestore usage cheap at scale
// ---------------------------------------------------------------------------
async function loadCampaigns(force=false){
  const cacheKey = 'kafel_campaigns_cache';
  if(!force){
    try{
      const c = JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(c && (Date.now()-c.t) < CACHE_TTL){ S.campaigns = c.data; return S.campaigns; }
    }catch(e){}
  }
  const snap = await getDocs(query(collection(db,'campaigns'), orderBy('raised','desc')));
  const data = snap.docs.map(d=>({id:d.id, ...d.data()}));
  S.campaigns = data;
  localStorage.setItem(cacheKey, JSON.stringify({t:Date.now(), data}));
  return data;
}
async function loadPaymentMethods(force=false){
  const cacheKey = 'kafel_pm_cache';
  if(!force){
    try{
      const c = JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(c && (Date.now()-c.t) < CACHE_TTL){ S.paymentMethods = c.data; return S.paymentMethods; }
    }catch(e){}
  }
  const snap = await getDocs(collection(db,'paymentMethods'));
  const data = snap.docs.map(d=>({id:d.id, ...d.data()}));
  S.paymentMethods = data;
  localStorage.setItem(cacheKey, JSON.stringify({t:Date.now(), data}));
  return data;
}
function invalidateCache(key){ localStorage.removeItem(key); }

async function loadMyDonations(){
  if(!S.user) return [];
  const snap = await getDocs(query(collection(db,'donations'), where('uid','==',S.user.uid), where('status','==','approved'), orderBy('createdAt','desc')));
  S.myDonations = snap.docs.map(d=>({id:d.id, ...d.data()}));
  return S.myDonations;
}

function listenNotifications(){
  if(notifUnsub || !S.user) return;
  const qy = query(collection(db,'users',S.user.uid,'notifications'), orderBy('createdAt','desc'), limit(30));
  notifUnsub = onSnapshot(qy, snap=>{
    S.notifications = snap.docs.map(d=>({id:d.id, ...d.data()}));
    S.unreadNotif = S.notifications.some(n=>!n.read);
    refreshBellDots();
  });
}
function listenPendingAdmin(){
  if(pendingUnsub || !S.isOwner) return;
  const qy = query(collection(db,'donations'), where('status','==','pending'), limit(1));
  pendingUnsub = onSnapshot(qy, snap=>{
    S.pendingAdminCount = snap.size;
    refreshBellDots();
  });
}
function refreshBellDots(){
  document.querySelectorAll('.bell .dot').forEach(d=> d.style.display = S.unreadNotif ? 'block':'none');
  document.querySelectorAll('.settings-dot').forEach(d=> d.style.display = (S.isOwner && S.pendingAdminCount>0) ? 'block':'none');
}
async function markAllNotificationsRead(){
  const unread = S.notifications.filter(n=>!n.read);
  if(!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach(n=> batch.update(doc(db,'users',S.user.uid,'notifications',n.id), {read:true}));
  await batch.commit();
}
async function sendNotification(uid, text){
  await addDoc(collection(db,'users',uid,'notifications'), {text, read:false, createdAt: serverTimestamp()});
}

function canChange(lastDate, months){
  if(!lastDate) return true;
  const d = lastDate.toDate ? lastDate.toDate() : new Date(lastDate);
  const next = new Date(d); next.setMonth(next.getMonth()+months);
  return Date.now() >= next.getTime();
}
function nextAllowedDate(lastDate, months){
  const d = lastDate.toDate ? lastDate.toDate() : new Date(lastDate);
  const next = new Date(d); next.setMonth(next.getMonth()+months);
  return next.toLocaleDateString('ar-EG', {year:'numeric', month:'long', day:'numeric'});
}

// image compression to keep Firestore docs small (screenshots stored as text, never in a storage bucket)
function fileToCompressedBase64(file, maxW=900, quality=0.72){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1, maxW/img.width);
        const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
        const canvas = document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===========================================================================
// PAGE: auth-home
// ===========================================================================
definePage('auth-home', ()=>`
  <div class="page">
    <div class="auth-hero">
      <div class="mark">${ic.heart.replace('currentColor','#fff')}</div>
      <h1>الكافل</h1>
      <p>منصة موثوقة لجمع التبرعات ودعم الحملات الإنسانية بكل شفافية وأمان</p>
    </div>
    <div class="auth-actions">
      <button class="btn" data-nav="login">تسجيل الدخول</button>
      <button class="btn secondary" data-nav="signup">إنشاء حساب</button>
      <button class="btn btn-google" id="google-btn">${ic.google} المتابعة عبر جوجل</button>
    </div>
  </div>
`, ()=>{
  document.querySelectorAll('[data-nav]').forEach(b=> b.onclick = ()=> navigate(b.getAttribute('data-nav')));
  document.getElementById('google-btn').onclick = async ()=>{
    try{
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      await ensureUserProfile(res.user, {viaGoogle:true});
    }catch(e){ toast('تعذّر تسجيل الدخول عبر جوجل'); }
  };
});

definePage('login', ()=>`
  <div class="page">
    ${topbar('تسجيل الدخول')}
    <div class="scroll no-tabbar">
      <div class="form-wrap">
        <div class="field"><label>البريد الإلكتروني</label><input type="email" id="l-email" placeholder="example@email.com" dir="ltr"></div>
        <div class="field"><label>كلمة المرور</label><input type="password" id="l-pass" placeholder="••••••••" dir="ltr"></div>
        <button class="btn" id="l-submit">تسجيل الدخول</button>
      </div>
    </div>
  </div>
`, ()=>{
  document.getElementById('l-submit').onclick = async ()=>{
    const email = document.getElementById('l-email').value.trim();
    const pass = document.getElementById('l-pass').value;
    if(!email || !pass) return toast('يرجى تعبئة جميع الحقول');
    const btn = document.getElementById('l-submit'); btn.disabled=true; btn.textContent='جاري الدخول...';
    try{
      const res = await signInWithEmailAndPassword(auth, email, pass);
      await ensureUserProfile(res.user, {});
    }catch(e){
      toast('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      btn.disabled=false; btn.textContent='تسجيل الدخول';
    }
  };
});

definePage('signup', ()=>`
  <div class="page">
    ${topbar('إنشاء حساب')}
    <div class="scroll no-tabbar">
      <div class="form-wrap">
        <div class="field"><label>الاسم الثلاثي</label><input type="text" id="s-name" placeholder="الاسم الأول والأب واللقب"></div>
        <div class="field"><label>البريد الإلكتروني</label><input type="email" id="s-email" placeholder="example@email.com" dir="ltr"></div>
        <div class="field"><label>رقم الهاتف</label><input type="tel" id="s-phone" placeholder="07xxxxxxxxx" dir="ltr"></div>
        <div class="field"><label>كلمة المرور</label><input type="password" id="s-pass" placeholder="6 أحرف على الأقل" dir="ltr"></div>
        <button class="btn" id="s-submit">إنشاء حساب</button>
      </div>
    </div>
  </div>
`, ()=>{
  document.getElementById('s-submit').onclick = async ()=>{
    const name = document.getElementById('s-name').value.trim();
    const email = document.getElementById('s-email').value.trim();
    const phone = document.getElementById('s-phone').value.trim();
    const pass = document.getElementById('s-pass').value;
    if(!name || name.split(/\s+/).length<2) return toast('يرجى إدخال الاسم الثلاثي كاملاً');
    if(!email || !phone || !pass) return toast('يرجى تعبئة جميع الحقول');
    if(pass.length<6) return toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    const btn = document.getElementById('s-submit'); btn.disabled=true; btn.textContent='جاري الإنشاء...';
    try{
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, {displayName:name});
      await ensureUserProfile(res.user, {name, phone});
    }catch(e){
      let msg = 'تعذّر إنشاء الحساب';
      if(e.code==='auth/email-already-in-use') msg='هذا البريد الإلكتروني مستخدم مسبقًا';
      if(e.code==='auth/invalid-email') msg='صيغة البريد الإلكتروني غير صحيحة';
      toast(msg);
      btn.disabled=false; btn.textContent='إنشاء حساب';
    }
  };
});

async function ensureUserProfile(fbUser, {name, phone, viaGoogle}={}){
  const ref = doc(db,'users',fbUser.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
      name: name || fbUser.displayName || 'مستخدم الكافل',
      email: fbUser.email || '',
      phone: phone || '',
      role: (fbUser.email===OWNER_EMAIL) ? 'owner' : 'user',
      donatedTotal: 0,
      createdAt: serverTimestamp(),
    });
  }
  toast('تم تسجيل الدخول بنجاح');
}

// ===========================================================================
// PAGE: home
// ===========================================================================
definePage('home', ()=>{
  const p = S.profile || {};
  return `<div class="page">
    <div class="scroll">
      <div class="home-header">
        <div class="brand-mark"><div class="mark">${ic.heart.replace('currentColor','#fff')}</div><span>الكافل</span></div>
        <button class="bell" data-nav="notifications">${ic.bell}<span class="dot" style="display:${S.unreadNotif?'block':'none'}"></span></button>
      </div>
      <div class="balance-card">
        <div class="label">الرصيد المتبرع به</div>
        <div class="amount">${fmtMoney(p.donatedTotal||0)}<span class="cur">د.ع</span></div>
      </div>
      <div class="quick-actions">
        <button class="qa-btn qa1" data-nav="donate-method" data-type="صدقة"><div class="ic">${ic.hand}</div>تبرع بصدقة</button>
        <button class="qa-btn qa2" data-nav="my-donations"><div class="ic">${ic.wallet}</div>تبرعاتي</button>
        <button class="qa-btn qa3" id="no-money"><div class="ic">${ic.gift}</div>تبرع بدون أموال</button>
      </div>
      <div class="section-title"><h3>حملات التبرع</h3></div>
      <div class="camp-grid" id="home-camps">${campSkeleton()}</div>
    </div>
    ${tabbar('home')}
  </div>`;
}, async ()=>{
  document.getElementById('no-money').onclick = ()=> modal({icon:ic.gift, title:'تبرع بدون أموال', text:'سيتم افتتاح هذه الميزة قريبًا', okText:'تمام'});
  document.querySelector('[data-nav="donate-method"]').onclick = ()=> navigate('donate-method', {type:'صدقة'});
  wireTabNav();
  const camps = await loadCampaigns();
  const box = document.getElementById('home-camps');
  if(box){
    if(!camps.length){ box.outerHTML = `<div class="empty-hint">لا توجد حملات تبرع حاليًا</div>`; }
    else{
      box.innerHTML = camps.slice(0,6).map(c=>`
        <div class="camp-card tap" data-camp="${c.id}">
          <div class="img"><img src="${c.image||''}" loading="lazy" alt=""></div>
          <div class="name">${esc(c.name)}</div>
        </div>`).join('');
      box.querySelectorAll('[data-camp]').forEach(el=> el.onclick = ()=> navigate('campaign-detail', {id: el.dataset.camp}));
    }
  }
});
function campSkeleton(){ return Array.from({length:3}).map(()=>`<div class="camp-card"><div class="img" style="background:var(--surface-2)"></div><div class="name">&nbsp;</div></div>`).join(''); }
function wireTabNav(){
  document.querySelectorAll('[data-nav]').forEach(b=>{
    if(b.onclick) return;
    b.onclick = ()=> navigate(b.getAttribute('data-nav'), b.dataset.type?{type:b.dataset.type}:{});
  });
}

// ===========================================================================
// PAGE: notifications
// ===========================================================================
definePage('notifications', ()=>`
  <div class="page">
    ${topbar('الإشعارات')}
    <div class="scroll no-tabbar" id="notif-list">
      <div class="center-msg"><div class="spinner"></div></div>
    </div>
  </div>
`, async ()=>{
  await markAllNotificationsRead();
  S.unreadNotif = false; refreshBellDots();
  const box = document.getElementById('notif-list');
  const render = ()=>{
    if(!S.notifications.length){ box.innerHTML = `<div class="center-msg">${ic.inbox}<div>لا توجد إشعارات بعد</div></div>`; return; }
    box.innerHTML = `<div class="list" style="padding-top:14px;">${S.notifications.map(n=>`
      <div class="row-card"><div class="row-ic">${ic.bell}</div>
        <div class="row-txt"><b>${esc(n.text)}</b><small>${timeAgo(n.createdAt)}</small></div>
      </div>`).join('')}</div>`;
  };
  render();
});

// ===========================================================================
// PAGE: campaign-detail
// ===========================================================================
definePage('campaign-detail', (p)=>{
  const c = S.campaigns.find(x=>x.id===p.id) || {};
  const pct = c.target ? Math.min(100, Math.round(((c.raised||0)/c.target)*100)) : 0;
  return `<div class="page">
    ${topbar('تفاصيل الحملة')}
    <div class="scroll no-tabbar">
      <div style="padding:18px;">
        <h2 style="font-size:19px; margin-bottom:14px;">${esc(c.name||'')}</h2>
        <img src="${c.image||''}" style="width:100%; border-radius:18px; max-height:230px; object-fit:cover; background:var(--surface-2);" alt="">
        <div class="progress-track" style="margin-top:16px;"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-meta"><span>تم جمع ${fmtMoney(c.raised||0)} د.ع</span><span>الهدف ${fmtMoney(c.target||0)} د.ع</span></div>
        <div style="margin-top:20px; line-height:1.9; font-size:14.5px; color:var(--text-dim); white-space:pre-wrap;">${esc(c.details||'')}</div>
      </div>
    </div>
    <div style="padding:14px 18px calc(18px + var(--safe-bottom)); border-top:1px solid var(--border); background:var(--surface);">
      <button class="btn" id="donate-camp">تبرع لـ ${esc(c.name||'')}</button>
    </div>
  </div>`;
}, (p)=>{
  document.getElementById('donate-camp').onclick = ()=> navigate('donate-method', {type:c_name(p.id), campaignId:p.id});
});
function c_name(id){ return (S.campaigns.find(x=>x.id===id)||{}).name || 'الحملة'; }

// ===========================================================================
// PAGE: campaigns-tab (list with progress, sorted by raised desc)
// ===========================================================================
definePage('campaigns-tab', ()=>`
  <div class="page">
    <div class="scroll">
      <div class="home-header"><div class="brand-mark"><span style="font-family:'Cairo',sans-serif; font-weight:900; font-size:19px;">حملات التبرع</span></div></div>
      <div class="list" id="camps-list" style="margin-top:8px;">${campRowSkeleton()}</div>
    </div>
    ${tabbar('campaigns-tab')}
  </div>
`, async ()=>{
  wireTabNav();
  const camps = await loadCampaigns();
  const box = document.getElementById('camps-list');
  if(!camps.length){ box.innerHTML = `<div class="empty-hint">لا توجد حملات تبرع حاليًا</div>`; return; }
  box.innerHTML = camps.map(c=>{
    const pct = c.target ? Math.min(100, Math.round(((c.raised||0)/c.target)*100)) : 0;
    return `<div class="camp-row tap" data-camp="${c.id}">
      <img class="img" src="${c.image||''}" alt="">
      <div class="body">
        <b>${esc(c.name)}</b>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-meta"><span>${fmtMoney(c.raised||0)} د.ع</span><span>الهدف ${fmtMoney(c.target||0)} د.ع</span></div>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-camp]').forEach(el=> el.onclick = ()=> navigate('campaign-detail', {id: el.dataset.camp}));
});
function campRowSkeleton(){ return Array.from({length:4}).map(()=>`<div class="camp-row"><div class="img" style="background:var(--surface-2)"></div><div class="body"><b>&nbsp;</b></div></div>`).join(''); }

// ===========================================================================
// PAGE: my-donations
// ===========================================================================
definePage('my-donations', ()=>`
  <div class="page">
    ${topbar('تبرعاتي')}
    <div class="scroll no-tabbar" id="my-don-list"><div class="center-msg"><div class="spinner"></div></div></div>
  </div>
`, async ()=>{
  const list = await loadMyDonations();
  const box = document.getElementById('my-don-list');
  if(!list.length){ box.innerHTML = `<div class="center-msg">${ic.wallet}<div>لا توجد تبرعات ناجحة بعد</div></div>`; return; }
  box.innerHTML = `<div class="list" style="padding-top:14px;">${list.map(d=>`
    <div class="row-card"><div class="row-ic">${ic.heart}</div>
      <div class="row-txt"><b>${esc(d.type)}</b><small>${fmtMoney(d.amount)} د.ع • ${timeAgo(d.createdAt)}</small></div>
    </div>`).join('')}</div>`;
});

// ===========================================================================
// PAGE: donate-method -> donate-transfer
// ===========================================================================
const donateDraft = {};
definePage('donate-method', (p)=>{
  Object.keys(donateDraft).forEach(k=> delete donateDraft[k]);
  donateDraft.type = p.type; donateDraft.campaignId = p.campaignId || null;
  return `<div class="page">
    ${topbar('اختر طريقة الدفع')}
    <div class="scroll no-tabbar">
      <div class="form-wrap" style="padding-top:16px;">
        <div id="pm-list">${pmSkeleton()}</div>
        <div class="field" style="margin-top:18px;">
          <label>المبلغ المراد التبرع به (د.ع)</label>
          <input type="number" inputmode="numeric" id="don-amount" placeholder="مثال: 25000" dir="ltr">
        </div>
        <button class="btn" id="don-next" style="margin-top:8px;">التالي</button>
      </div>
    </div>
  </div>`;
}, async ()=>{
  const box = document.getElementById('pm-list');
  const methods = await loadPaymentMethods();
  if(!methods.length){ box.innerHTML = `<div class="empty-hint">لا توجد طرق دفع متاحة حاليًا</div>`; }
  else{
    box.innerHTML = methods.map(m=>`
      <div class="pay-option tap" data-pm="${m.id}"><b>${esc(m.name)}</b><div class="radio-dot"></div></div>
    `).join('');
    box.querySelectorAll('.pay-option').forEach(el=>{
      el.onclick = ()=>{
        box.querySelectorAll('.pay-option').forEach(x=>x.classList.remove('selected'));
        el.classList.add('selected');
        donateDraft.paymentMethodId = el.dataset.pm;
        donateDraft.paymentMethodName = methods.find(m=>m.id===el.dataset.pm)?.name;
        donateDraft.paymentMethodNumber = methods.find(m=>m.id===el.dataset.pm)?.number;
      };
    });
  }
  document.getElementById('don-next').onclick = ()=>{
    const amount = Number(document.getElementById('don-amount').value);
    if(!donateDraft.paymentMethodId) return toast('يرجى اختيار طريقة الدفع');
    if(!amount || amount<=0) return toast('يرجى إدخال مبلغ صحيح');
    donateDraft.amount = amount;
    navigate('donate-transfer', {});
  };
});
function pmSkeleton(){ return Array.from({length:3}).map(()=>`<div class="pay-option"><b>&nbsp;</b><div class="radio-dot"></div></div>`).join(''); }

definePage('donate-transfer', ()=>`
  <div class="page">
    ${topbar('تحويل المبلغ')}
    <div class="scroll no-tabbar">
      <div class="form-wrap" style="padding-top:16px;">
        <div class="copy-box tap" id="copy-num">
          <div class="num">${esc(donateDraft.paymentMethodNumber||'')}</div>
          <small>${esc(donateDraft.paymentMethodName||'')} — اضغط للنسخ</small>
        </div>
        <p style="font-size:13px; color:var(--text-dim); text-align:center; margin-bottom:16px; line-height:1.8;">
          يجب إرفاق صورة (سكرين شوت) تثبت إتمام عملية التحويل قبل تأكيد التبرع
        </p>
        <label class="upload-box" id="upload-box">
          <div class="up-ic">${ic.camera}</div>
          <b>اضغط هنا لرفع صورة إثبات التحويل</b>
          <span class="hint">JPG أو PNG</span>
          <input type="file" accept="image/*" id="shot-input">
        </label>
        <button class="btn" id="confirm-donate" disabled>تأكيد التحويل</button>
      </div>
    </div>
  </div>
`, ()=>{
  document.getElementById('copy-num').onclick = ()=>{
    navigator.clipboard?.writeText(donateDraft.paymentMethodNumber||'').then(()=> toast('تم نسخ الرقم'));
  };
  const input = document.getElementById('shot-input');
  const uploadBox = document.getElementById('upload-box');
  const confirmBtn = document.getElementById('confirm-donate');
  input.onchange = async ()=>{
    const f = input.files[0]; if(!f) return;
    uploadBox.innerHTML = `<div class="spinner" style="margin:20px auto;"></div>`;
    try{
      const b64 = await fileToCompressedBase64(f);
      donateDraft.screenshot = b64;
      uploadBox.outerHTML = `<div class="upload-box filled" id="upload-box"><img src="${b64}"><button class="remove-shot" id="remove-shot">${ic.x}</button></div>`;
      document.getElementById('remove-shot').onclick = (e)=>{ e.preventDefault(); donateDraft.screenshot=null; render(); };
      confirmBtn.disabled = false;
    }catch(e){ toast('تعذّر تحميل الصورة'); }
  };
  confirmBtn.onclick = async ()=>{
    if(!donateDraft.screenshot) return toast('يرجى إرفاق صورة الإثبات');
    confirmBtn.disabled = true; confirmBtn.textContent = 'جاري الإرسال...';
    try{
      await addDoc(collection(db,'donations'), {
        uid: S.user.uid,
        donorName: S.profile?.name || S.user.displayName || '',
        type: donateDraft.type,
        campaignId: donateDraft.campaignId || null,
        amount: donateDraft.amount,
        paymentMethod: donateDraft.paymentMethodName,
        screenshot: donateDraft.screenshot,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      await sendNotification(S.user.uid, `تم إرسال تبرعك بمبلغ ${fmtMoney(donateDraft.amount)} د.ع، سيتم مراجعته وإبلاغك بعد المراجعة`);
      modal({icon:ic.check, title:'تم الإرسال بنجاح', text:'تبرعك الآن قيد المراجعة، سنقوم بإعلامك فور الموافقة عليه', okText:'العودة للرئيسية', onOk:()=> resetTo('home')});
    }catch(e){
      toast('حدث خطأ أثناء الإرسال، حاول مجددًا');
      confirmBtn.disabled=false; confirmBtn.textContent='تأكيد التحويل';
    }
  };
});

// ===========================================================================
// PAGE: settings
// ===========================================================================
definePage('settings', ()=>{
  const p = S.profile || {};
  const rows = [
    {k:'change-name', label:'تغيير الاسم', sub:p.name||'', icon:ic.user},
    {k:'change-email', label:'تغيير البريد الإلكتروني', sub:p.email||'', icon:ic.mail},
    {k:'change-phone', label:'تغيير رقم الهاتف', sub:p.phone||'', icon:ic.phone},
    {k:'change-lang', label:'اللغة', sub: {ar:'العربية', en:'English', ku:'کوردی'}[S.lang], icon:ic.globe},
  ];
  return `<div class="page">
    <div class="scroll">
      <div class="home-header"><div class="brand-mark"><span style="font-family:'Cairo',sans-serif; font-weight:900; font-size:19px;">الإعدادات</span></div></div>
      <div class="list" style="margin-top:8px;">
        ${rows.map(r=>`<div class="row-card tap" data-nav="${r.k}">
          <div class="row-ic">${r.icon}</div>
          <div class="row-txt"><b>${r.label}</b><small>${esc(r.sub)}</small></div>
          <div class="chev">${ic.chev}</div>
        </div>`).join('')}
        <div class="row-card">
          <div class="row-ic">${ic.moon}</div>
          <div class="row-txt"><b>الوضع الليلي</b><small>يبقى الاختيار محفوظًا دائمًا</small></div>
          <div class="switch ${S.theme==='dark'?'on':''}" id="theme-switch"><div class="knob"></div></div>
        </div>
        ${S.isOwner ? `<div class="row-card tap" data-nav="admin-home">
          <div class="row-ic">${ic.shield}</div>
          <div class="row-txt"><b>لوحة تحكم المالك</b><small>إدارة التبرعات والحملات وطرق الدفع</small></div>
          <span class="badge-dot settings-dot" style="display:${S.pendingAdminCount>0?'block':'none'}"></span>
        </div>` : ''}
        <div class="row-card tap" id="logout-row">
          <div class="row-ic" style="color:var(--danger);">${ic.logout}</div>
          <div class="row-txt"><b style="color:var(--danger);">تسجيل الخروج</b></div>
        </div>
      </div>
    </div>
    ${tabbar('settings')}
  </div>`;
}, ()=>{
  wireTabNav();
  document.getElementById('theme-switch').onclick = ()=>{
    applyTheme(S.theme==='dark' ? 'light':'dark');
    render();
  };
  document.getElementById('logout-row').onclick = ()=>{
    modal({icon:ic.logout, title:'تسجيل الخروج', text:'هل أنت متأكد من رغبتك بتسجيل الخروج؟', okText:'تسجيل الخروج', cancelText:'إلغاء', onOk: async ()=>{
      if(notifUnsub){ notifUnsub(); notifUnsub=null; }
      if(pendingUnsub){ pendingUnsub(); pendingUnsub=null; }
      await signOut(auth);
    }});
  };
});

definePage('change-lang', ()=>`
  <div class="page">
    ${topbar('اللغة')}
    <div class="scroll no-tabbar">
      <div class="form-wrap">
        ${[{k:'ar',n:'العربية'},{k:'en',n:'English'},{k:'ku',n:'کوردی (کوردستان)'}].map(l=>`
          <div class="lang-opt tap ${S.lang===l.k?'active':''}" data-lang="${l.k}">
            <b>${l.n}</b>${S.lang===l.k?`<span class="check-mark">${ic.check}</span>`:''}
          </div>`).join('')}
      </div>
    </div>
  </div>
`, ()=>{
  document.querySelectorAll('[data-lang]').forEach(el=>{
    el.onclick = ()=>{ applyLang(el.dataset.lang); toast('تم حفظ اللغة'); navigate('settings', {}, true); };
  });
});

definePage('change-name', ()=>{
  const p = S.profile||{};
  const ok = canChange(p.lastNameChange, 1);
  return `<div class="page">
    ${topbar('تغيير الاسم')}
    <div class="scroll no-tabbar"><div class="form-wrap">
      ${ok ? `
        <div class="field"><label>الاسم الثلاثي الجديد</label><input type="text" id="new-name" value="${esc(p.name||'')}"></div>
        <button class="btn" id="save-name">حفظ التغييرات</button>
      ` : `<div class="center-msg">${ic.user}<div>يمكنك تغيير الاسم مرة واحدة كل شهر</div><small>التغيير التالي متاح بتاريخ ${nextAllowedDate(p.lastNameChange,1)}</small></div>`}
    </div></div>
  </div>`;
}, ()=>{
  const btn = document.getElementById('save-name');
  if(!btn) return;
  btn.onclick = async ()=>{
    const name = document.getElementById('new-name').value.trim();
    if(name.split(/\s+/).length<2) return toast('يرجى إدخال الاسم الثلاثي كاملاً');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    await updateDoc(doc(db,'users',S.user.uid), {name, lastNameChange: serverTimestamp()});
    S.profile.name = name; S.profile.lastNameChange = Timestamp.now();
    toast('تم تغيير الاسم بنجاح');
    navigate('settings', {}, true);
  };
});

definePage('change-email', ()=>{
  const p = S.profile||{};
  const ok = canChange(p.lastEmailChange, 3);
  return `<div class="page">
    ${topbar('تغيير البريد الإلكتروني')}
    <div class="scroll no-tabbar"><div class="form-wrap">
      ${ok ? `
        <div class="field"><label>البريد الإلكتروني الجديد</label><input type="email" id="new-email" placeholder="example@email.com" dir="ltr"></div>
        <div class="field"><label>كلمة المرور الحالية</label><input type="password" id="cur-pass" placeholder="لتأكيد هويتك" dir="ltr"></div>
        <button class="btn" id="save-email">حفظ التغييرات</button>
      ` : `<div class="center-msg">${ic.mail}<div>يمكنك تغيير البريد الإلكتروني كل 3 أشهر</div><small>التغيير التالي متاح بتاريخ ${nextAllowedDate(p.lastEmailChange,3)}</small></div>`}
    </div></div>
  </div>`;
}, ()=>{
  const btn = document.getElementById('save-email');
  if(!btn) return;
  btn.onclick = async ()=>{
    const email = document.getElementById('new-email').value.trim();
    if(!email) return toast('يرجى إدخال البريد الإلكتروني');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    try{
      await updateEmail(auth.currentUser, email);
      await updateDoc(doc(db,'users',S.user.uid), {email, lastEmailChange: serverTimestamp()});
      S.profile.email = email; S.profile.lastEmailChange = Timestamp.now();
      toast('تم تغيير البريد الإلكتروني بنجاح');
      navigate('settings', {}, true);
    }catch(e){
      toast('تعذّر التغيير، قد تحتاج لتسجيل الدخول مجددًا');
      btn.disabled=false; btn.textContent='حفظ التغييرات';
    }
  };
});

definePage('change-phone', ()=>{
  const p = S.profile||{};
  const ok = canChange(p.lastPhoneChange, 3);
  return `<div class="page">
    ${topbar('تغيير رقم الهاتف')}
    <div class="scroll no-tabbar"><div class="form-wrap">
      ${ok ? `
        <div class="field"><label>رقم الهاتف الجديد</label><input type="tel" id="new-phone" placeholder="07xxxxxxxxx" dir="ltr"></div>
        <button class="btn" id="save-phone">حفظ التغييرات</button>
      ` : `<div class="center-msg">${ic.phone}<div>يمكنك تغيير رقم الهاتف كل 3 أشهر</div><small>التغيير التالي متاح بتاريخ ${nextAllowedDate(p.lastPhoneChange,3)}</small></div>`}
    </div></div>
  </div>`;
}, ()=>{
  const btn = document.getElementById('save-phone');
  if(!btn) return;
  btn.onclick = async ()=>{
    const phone = document.getElementById('new-phone').value.trim();
    if(!phone) return toast('يرجى إدخال رقم الهاتف');
    btn.disabled=true; btn.textContent='جاري الحفظ...';
    await updateDoc(doc(db,'users',S.user.uid), {phone, lastPhoneChange: serverTimestamp()});
    S.profile.phone = phone; S.profile.lastPhoneChange = Timestamp.now();
    toast('تم تغيير رقم الهاتف بنجاح');
    navigate('settings', {}, true);
  };
});

// ===========================================================================
// ADMIN PAGES
// ===========================================================================
definePage('admin-home', ()=>`
  <div class="page">
    ${topbar('لوحة تحكم المالك')}
    <div class="scroll no-tabbar">
      <div class="grid3">
        <div class="tile tap" data-nav="admin-review"><div class="ic">${ic.inbox}</div><b>مراجعة التبرعات</b>
          ${S.pendingAdminCount>0?`<span class="badge-dot" style="display:block;"></span>`:''}
        </div>
        <div class="tile tap" data-nav="admin-campaigns"><div class="ic">${ic.heart}</div><b>إضافة حملات وحذفها</b></div>
        <div class="tile tap" data-nav="admin-payments"><div class="ic">${ic.card}</div><b>إضافة طريقة دفع</b></div>
      </div>
    </div>
  </div>
`, ()=>{ document.querySelectorAll('[data-nav]').forEach(b=> b.onclick = ()=> navigate(b.getAttribute('data-nav'))); });

definePage('admin-review', ()=>`
  <div class="page">
    ${topbar('مراجعة التبرعات')}
    <div class="scroll no-tabbar" id="review-list"><div class="center-msg"><div class="spinner"></div></div></div>
  </div>
`, async ()=>{
  const box = document.getElementById('review-list');
  const snap = await getDocs(query(collection(db,'donations'), where('status','==','pending'), orderBy('createdAt','desc')));
  const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
  if(!list.length){ box.innerHTML = `<div class="center-msg">${ic.check}<div>لا توجد تبرعات بانتظار المراجعة</div></div>`; return; }
  box.innerHTML = `<div style="padding:16px 18px;">${list.map(d=>`
    <div class="donor-card">
      <img src="${d.screenshot||''}" alt="">
      <div class="kv"><span>الاسم</span><span>${esc(d.donorName)}</span></div>
      <div class="kv"><span>نوع التبرع</span><span>${esc(d.type)}</span></div>
      <div class="kv"><span>طريقة الدفع</span><span>${esc(d.paymentMethod||'')}</span></div>
      <div class="kv"><span>المبلغ</span><span>${fmtMoney(d.amount)} د.ع</span></div>
      <div class="two-btn">
        <button class="btn" data-approve="${d.id}">قبول</button>
        <button class="btn danger" data-reject="${d.id}">رفض</button>
      </div>
    </div>`).join('')}</div>`;
  box.querySelectorAll('[data-approve]').forEach(b=> b.onclick = ()=> handleReview(list.find(x=>x.id===b.dataset.approve), true, b));
  box.querySelectorAll('[data-reject]').forEach(b=> b.onclick = ()=> handleReview(list.find(x=>x.id===b.dataset.reject), false, b));
});
async function handleReview(donation, approve, btn){
  btn.closest('.two-btn').querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    await updateDoc(doc(db,'donations',donation.id), {status: approve?'approved':'rejected', reviewedAt: serverTimestamp()});
    if(approve){
      await updateDoc(doc(db,'users',donation.uid), {donatedTotal: increment(donation.amount)});
      if(donation.campaignId){
        await updateDoc(doc(db,'campaigns',donation.campaignId), {raised: increment(donation.amount)});
        invalidateCache('kafel_campaigns_cache');
      }
      await sendNotification(donation.uid, `تمت الموافقة على تبرعك بمبلغ ${fmtMoney(donation.amount)} د.ع، جزاك الله خيرًا`);
    }
    toast(approve? 'تم قبول التبرع':'تم رفض التبرع');
    navigate('admin-review', {}, true);
  }catch(e){ toast('حدث خطأ، حاول مجددًا'); }
}

definePage('admin-campaigns', ()=>`
  <div class="page">
    ${topbar('إضافة حملات وحذفها')}
    <div class="scroll no-tabbar">
      <div class="form-wrap" style="padding-bottom:6px;"><button class="btn" id="add-camp-btn">${ic.plus} إضافة حملة</button></div>
      <div class="list" id="admin-camps-list">${campRowSkeleton()}</div>
    </div>
  </div>
`, async ()=>{
  document.getElementById('add-camp-btn').onclick = ()=> navigate('campaign-form', {});
  const camps = await loadCampaigns(true);
  const box = document.getElementById('admin-camps-list');
  if(!camps.length){ box.innerHTML = `<div class="empty-hint">لا توجد حملات مضافة بعد</div>`; return; }
  box.innerHTML = camps.map(c=>`
    <div class="row-card"><div class="row-ic"><img src="${c.image||''}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;"></div>
      <div class="row-txt"><b>${esc(c.name)}</b><small>${fmtMoney(c.raised||0)} / ${fmtMoney(c.target||0)} د.ع</small></div>
      <button class="chev" style="background:none;border:none;" data-more="${c.id}">${ic.dots}</button>
    </div>`).join('');
  box.querySelectorAll('[data-more]').forEach(b=>{
    b.onclick = ()=> actionSheet([
      {label:'تعديل الحملة', icon:ic.edit, onClick: ()=> navigate('campaign-form', {id:b.dataset.more})},
      {label:'حذف الحملة', icon:ic.trash, danger:true, onClick: ()=> modal({icon:ic.trash, title:'حذف الحملة', text:'هل أنت متأكد من حذف هذه الحملة نهائيًا؟', okText:'حذف', cancelText:'إلغاء', onOk: async ()=>{
        await deleteDoc(doc(db,'campaigns',b.dataset.more));
        invalidateCache('kafel_campaigns_cache');
        toast('تم حذف الحملة');
        navigate('admin-campaigns', {}, true);
      }})},
    ]);
  });
});

definePage('campaign-form', (p)=>{
  const c = p.id ? S.campaigns.find(x=>x.id===p.id) : null;
  return `<div class="page">
    ${topbar(c ? 'تعديل الحملة':'إضافة حملة')}
    <div class="scroll no-tabbar"><div class="form-wrap">
      <div class="field"><label>اسم الحملة</label><input type="text" id="cf-name" value="${esc(c?.name||'')}"></div>
      <div class="field"><label>رابط صورة الحملة</label><input type="url" id="cf-image" placeholder="https://..." value="${esc(c?.image||'')}" dir="ltr">
        <div class="hint">ألصق رابط صورة (بدون رفع ملفات) — سيظهر في الصفحة الرئيسية وقسم الحملات</div>
      </div>
      <div class="field"><label>تفاصيل الحملة</label><textarea id="cf-details" maxlength="12000" placeholder="اكتب تفاصيل الحملة كاملة...">${esc(c?.details||'')}</textarea></div>
      <div class="field"><label>المبلغ المطلوب (د.ع)</label><input type="number" id="cf-target" dir="ltr" value="${c?.target||''}"></div>
      <button class="btn" id="cf-save">${c?'حفظ التعديلات':'إضافة حملة'}</button>
    </div></div>
  </div>`;
}, (p)=>{
  document.getElementById('cf-save').onclick = async ()=>{
    const name = document.getElementById('cf-name').value.trim();
    const image = document.getElementById('cf-image').value.trim();
    const details = document.getElementById('cf-details').value.trim();
    const target = Number(document.getElementById('cf-target').value);
    if(!name || !target) return toast('يرجى تعبئة اسم الحملة والمبلغ المطلوب');
    const btn = document.getElementById('cf-save'); btn.disabled=true; btn.textContent='جاري الحفظ...';
    try{
      if(p.id){
        await updateDoc(doc(db,'campaigns',p.id), {name, image, details, target});
      }else{
        await addDoc(collection(db,'campaigns'), {name, image, details, target, raised:0, createdAt: serverTimestamp()});
      }
      invalidateCache('kafel_campaigns_cache');
      toast('تم الحفظ بنجاح');
      goBack();
    }catch(e){ toast('حدث خطأ، حاول مجددًا'); btn.disabled=false; btn.textContent='حفظ'; }
  };
});

definePage('admin-payments', ()=>`
  <div class="page">
    ${topbar('طرق الدفع')}
    <div class="scroll no-tabbar">
      <div class="form-wrap" style="padding-bottom:6px;">
        <div class="field"><label>اسم طريقة الدفع</label><input type="text" id="pm-name" placeholder="مثال: زين كاش"></div>
        <div class="field"><label>الرقم</label><input type="text" id="pm-number" placeholder="0770xxxxxxx" dir="ltr"></div>
        <button class="btn" id="pm-add">${ic.plus} إضافة طريقة دفع</button>
      </div>
      <div class="list" id="admin-pm-list">${pmSkeleton()}</div>
    </div>
  </div>
`, async ()=>{
  document.getElementById('pm-add').onclick = async ()=>{
    const name = document.getElementById('pm-name').value.trim();
    const number = document.getElementById('pm-number').value.trim();
    if(!name || !number) return toast('يرجى تعبئة الحقلين');
    await addDoc(collection(db,'paymentMethods'), {name, number, createdAt: serverTimestamp()});
    invalidateCache('kafel_pm_cache');
    toast('تمت الإضافة بنجاح');
    navigate('admin-payments', {}, true);
  };
  const methods = await loadPaymentMethods(true);
  const box = document.getElementById('admin-pm-list');
  if(!methods.length){ box.innerHTML = `<div class="empty-hint">لا توجد طرق دفع مضافة بعد</div>`; return; }
  box.innerHTML = methods.map(m=>`
    <div class="row-card"><div class="row-ic">${ic.card}</div>
      <div class="row-txt"><b>${esc(m.name)}</b><small dir="ltr" style="display:block;">${esc(m.number)}</small></div>
      <button class="chev" style="background:none;border:none;" data-more="${m.id}">${ic.dots}</button>
    </div>`).join('');
  box.querySelectorAll('[data-more]').forEach(b=>{
    b.onclick = ()=> actionSheet([
      {label:'حذف طريقة الدفع', icon:ic.trash, danger:true, onClick: ()=> modal({icon:ic.trash, title:'حذف طريقة الدفع', text:'هل تريد حذفها نهائيًا؟', okText:'حذف', cancelText:'إلغاء', onOk: async ()=>{
        await deleteDoc(doc(db,'paymentMethods',b.dataset.more));
        invalidateCache('kafel_pm_cache');
        toast('تم الحذف');
        navigate('admin-payments', {}, true);
      }})},
    ]);
  });
});

// ===========================================================================
// Boot / auth state
// ===========================================================================
const MIN_SPLASH_MS = 1500;
const splashStart = Date.now();

onAuthStateChanged(auth, async (fbUser)=>{
  const wait = Math.max(0, MIN_SPLASH_MS - (Date.now()-splashStart));
  await new Promise(r=>setTimeout(r, wait));
  const splash = document.getElementById('splash');

  if(!fbUser){
    S.user = null; S.profile = null; S.isOwner = false;
    if(notifUnsub){ notifUnsub(); notifUnsub=null; }
    if(pendingUnsub){ pendingUnsub(); pendingUnsub=null; }
    resetTo('auth-home');
    fadeOutSplash(splash);
    return;
  }

  S.user = fbUser;
  try{
    let snap = await getDoc(doc(db,'users',fbUser.uid));
    if(!snap.exists()){
      await ensureUserProfile(fbUser, {});
      snap = await getDoc(doc(db,'users',fbUser.uid));
    }
    S.profile = snap.data();
    S.isOwner = fbUser.email === OWNER_EMAIL || S.profile?.role === 'owner';
    listenNotifications();
    if(S.isOwner) listenPendingAdmin();
    resetTo('home');
  }catch(e){
    resetTo('home');
  }
  fadeOutSplash(splash);
});

function fadeOutSplash(splash){
  if(!splash) return;
  splash.style.transition = 'opacity .4s ease';
  splash.style.opacity = '0';
  setTimeout(()=> splash.remove(), 420);
}
