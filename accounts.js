/* Copyright © 2026 Infinitum Imagery LLC. All rights reserved. */
'use strict';
const hostedAccount=['infinitummasstexting.web.app','infinitummasstexting.firebaseapp.com','localhost','127.0.0.1'].includes(location.hostname);
if(!hostedAccount)location.replace('https://infinitummasstexting.web.app/'+(location.pathname.endsWith('/admin.html')?'admin.html':'account.html'));
const $=id=>document.getElementById(id);
let config,session=null,selectedUser=null,refreshPromise=null,latestAccess=null,enrollmentComplete=false;
const status=message=>{$('status').textContent=message;};
function display(){const signed=!!session;$('auth-panel').hidden=signed;$('complete-signup').hidden=signed;$('session-panel').hidden=!signed;if(signed)$('account-email').textContent=session.email;}
async function json(url,body,token){
 const response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json();}catch{throw new Error('Account service is not available yet. Please try again later.');}
 if(!response.ok)throw new Error(typeof data.error==='string'?data.error:data.error?.message??'Could not complete this request.');return data;
}
async function auth(method,body){config??=await json('/__/firebase/init.json');return json('https://identitytoolkit.googleapis.com/v1/accounts:'+method+'?key='+encodeURIComponent(config.apiKey),body);}
// MARK: - Durable browser sign-in, independent of website release versions
const sessionKey='infinitum-session';
let sessionGeneration=0;
function loadSession(){
 try {
  const raw=localStorage.getItem(sessionKey)??sessionStorage.getItem(sessionKey);
  const value=JSON.parse(raw??'null');
  if(!value||typeof value.email!=='string'||typeof value.refreshToken!=='string'||!value.refreshToken)return null;
  // Migrate an existing tab sign-in without asking for the password again.
  localStorage.setItem(sessionKey,JSON.stringify(value));sessionStorage.removeItem(sessionKey);
  return value;
 } catch { return null; }
}
function save(){
 try {
  if(session)localStorage.setItem(sessionKey,JSON.stringify(session));else localStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionKey);
 } catch { status('Your browser could not save this sign-in. Allow site storage to stay signed in after closing the browser.'); }
 display();
}
function clearSession(){
 sessionGeneration++;session=null;selectedUser=null;latestAccess=null;enrollmentComplete=false;refreshPromise=null;
 if($('admin-panel'))$('admin-panel').hidden=true;
 save();
}
window.addEventListener('storage',event=>{
 if(event.key!==sessionKey&&event.key!==null)return;
 let next=null;try{next=JSON.parse(event.newValue??'null');}catch{}
 if(!next||next.email!==session?.email){location.reload();return;}
 // Same account refreshed in another tab: adopt it without a reload/refresh loop.
 session=next;
});
async function token(force=false){
 if(!session)throw new Error('Sign in first.');if(!force&&session.expires>Date.now())return session.idToken;
 if(!refreshPromise){const generation=sessionGeneration,refreshCredential=session.refreshToken;refreshPromise=(async()=>{config??=await json('/__/firebase/init.json');const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(config.apiKey),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshCredential})});const d=await response.json();if(generation!==sessionGeneration)throw new Error('Sign-in changed. Please try again.');if(!response.ok){if(['TOKEN_EXPIRED','INVALID_REFRESH_TOKEN','USER_DISABLED','USER_NOT_FOUND'].includes(d.error?.message)){clearSession();throw new Error('Your saved sign-in is no longer valid. Please sign in again.');}throw new Error('Could not refresh your account. Your sign-in is saved; please try again.');}if(typeof d.id_token!=='string'||!d.id_token||typeof d.refresh_token!=='string'||!d.refresh_token)throw new Error('Account refresh was incomplete. Your sign-in is saved; please try again.');session={...session,idToken:d.id_token,refreshToken:d.refresh_token,expires:Date.now()+3300000};save();return session.idToken;})().finally(()=>{if(generation===sessionGeneration)refreshPromise=null;});}
 return refreshPromise;
}
async function api(path,body){return json('/api'+path,body,await token());}
function profileData(){if(!$('profile-form').reportValidity())throw new Error('Complete the required account details and confirmations.');return {fullName:$('full-name').value,country:$('country').value,organization:$('organization').value,adultAuthorized:$('adult-authorized').checked,accepted:$('legal-accept').checked,version:'2026-09-20.2',referralCode:new URLSearchParams(location.search).get('ref')??undefined};}
async function enrollmentStatus(){const e=await api('/enrollment');enrollmentComplete=e.complete;$('profile-panel').hidden=e.complete;$('save-profile').hidden=false;if(!e.complete&&e.profile){$('full-name').value=e.profile.fullName??'';$('country').value=e.profile.country??'';$('organization').value=e.profile.organization??'';}return e.complete;}
$('complete-signup').addEventListener('click',()=>$('auth-form').requestSubmit());
$('profile-form').addEventListener('submit',e=>{e.preventDefault();if(!session)return;action(async()=>{await api('/enrollment',profileData());await refresh();});});
async function refresh(){await token(true);if(!await enrollmentStatus()){status('Complete your account details and review the agreements below.');return;}const a=await api('/account');latestAccess=a;$('plan-status').textContent=a.limit===null?(a.plan==='complimentary'?'Complimentary · no app sending cap':'Unlimited · no app sending cap'):a.plan.toUpperCase()+' · '+a.remaining+' of '+a.limit+' credits available';$('usage-status').textContent=a.used+' used · '+a.reserved+' reserved. Resets '+new Date(a.resetsAt).toLocaleString()+' (midnight UTC).';$('admin-link').hidden=!a.admin;if($('admin-panel'))$('admin-panel').hidden=!a.admin;document.querySelectorAll('[data-checkout]').forEach(b=>{b.disabled=a.premium;});status(a.admin?'Owner access verified. Your account is complimentary.':'Account updated.');}
async function action(fn){const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(error){status(error.message);}finally{buttons.forEach(b=>b.disabled=false);document.querySelectorAll('[data-checkout]').forEach(b=>{b.disabled=latestAccess?.premium===true;});if($('referral-payout'))$('referral-payout').disabled=!referralCanRequest;}}
$('create').addEventListener('change',()=>{$('profile-panel').hidden=!$('create').checked;$('sign-in').hidden=$('create').checked;$('save-profile').hidden=true;$('sign-in').textContent=$('create').checked?'Create free account':'Sign in';$('password').autocomplete=$('create').checked?'new-password':'current-password';});
$('auth-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const create=$('create').checked;const details=create?profileData():null;const email=$('email').value.trim(),password=$('password').value;$('password').value='';const d=await auth(create?'signUp':'signInWithPassword',{email,password,returnSecureToken:true});sessionGeneration++;session={email:d.email??email,idToken:d.idToken,refreshToken:d.refreshToken,expires:Date.now()+3300000};save();if(create){$('profile-panel').hidden=false;$('save-profile').hidden=false;await api('/enrollment',details);await enrollmentStatus();await auth('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:d.idToken});status('Verification email sent. Open its link, then choose Refresh account.');}else await refresh();});});
$('reset').addEventListener('click',()=>action(async()=>{const email=$('email').value.trim();if(!email)throw new Error('Enter your email address first.');try{await auth('sendOobCode',{requestType:'PASSWORD_RESET',email});}catch{}status('If that account exists, a password-reset email will arrive shortly.');}));
$('verify').addEventListener('click',()=>action(async()=>{await auth('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:await token()});status('Verification email sent.');}));
$('refresh').addEventListener('click',()=>action(refresh));
$('sign-out').addEventListener('click',()=>{clearSession();referralCanRequest=false;if($('referral-accept'))$('referral-accept').checked=false;if($('referral-link'))$('referral-link').value='';if($('referral-balance'))$('referral-balance').textContent='Sign in to view your earnings.';if($('referral-payout'))$('referral-payout').disabled=true;save();$('profile-panel').hidden=!$('create').checked;$('sign-in').hidden=$('create').checked;$('save-profile').hidden=true;if($('admin-panel'))$('admin-panel').hidden=true;status('Signed out of this browser. Your Mac app session is separate.');});
function billingURL(value){const url=new URL(value);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new Error('Unexpected checkout address.');return url.href;}
document.querySelectorAll('[data-checkout]').forEach(b=>b.addEventListener('click',()=>action(async()=>{const d=await api('/billing/checkout',{interval:b.dataset.checkout,tier:b.dataset.tier??'pro'});window.location.assign(billingURL(d.url));})));
$('portal').addEventListener('click',()=>action(async()=>{const d=await api('/billing/portal',{});window.location.assign(billingURL(d.url));}));
if($('search-form')){
 $('search-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const result=await api('/admin/users?email='+encodeURIComponent($('search-email').value.trim()));$('users').replaceChildren();$('grant-form').hidden=true;for(const user of result.users){const button=document.createElement('button');button.textContent=user.email+' · '+(user.verified===false?'Email not verified':user.grant?.enabled?'Complimentary grant':'No complimentary grant');button.addEventListener('click',()=>{selectedUser=user;$('grant-target').textContent='Account: '+user.email;$('grant-form').hidden=false;});$('users').append(button);}status(result.users.length?'Select an account to manage its access.':'No account found. Ask them to sign up and verify their email.');});});
 async function grant(enabled){if(!selectedUser)throw new Error('Select an account first.');const reason=$('grant-reason').value.trim();if(reason.length<3)throw new Error('Enter a reason for the audit log.');const date=$('grant-expiry').value;const expiresAt=date?new Date(date+'T23:59:59Z').getTime():null;await api('/admin/grant',{uid:selectedUser.uid,enabled,reason,expiresAt});status((enabled?'Unlimited app access granted to ':'Complimentary access revoked for ')+selectedUser.email+'. The change is recorded in the audit log.');}
 $('grant-form').addEventListener('submit',e=>{e.preventDefault();action(()=>grant(true));});$('revoke').addEventListener('click',()=>action(()=>grant(false)));
}
session=loadSession();if(hostedAccount){display();if(session)action(refresh);}
let lastAutoRefresh=Date.now();
function refreshOnReturn(){if(hostedAccount&&session&&!document.hidden&&Date.now()-lastAutoRefresh>30000){lastAutoRefresh=Date.now();action(refresh);}}
window.addEventListener('focus',refreshOnReturn);
window.addEventListener('online',()=>{lastAutoRefresh=0;refreshOnReturn();});
document.addEventListener('visibilitychange',refreshOnReturn);

// MARK: - Referrals; all balances and thresholds are enforced by the server
let referralCanRequest=false;
const usd=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
if($('referral-attribution'))$('referral-attribution').hidden=!new URLSearchParams(location.search).has('ref');
async function refreshReferrals(){
 const r=await api('/referrals');$('referral-link').value=r.link??'';
 $('referral-balance').textContent='On hold: '+usd(r.pending)+' · Eligible for review: '+usd(r.eligible)+' · Requested: '+usd(r.requested)+' · Paid: '+usd(r.paid);
 referralCanRequest=r.joined&&r.eligible>=r.minimum&&r.requested===0;$('referral-payout').disabled=!referralCanRequest;
 return r;
}
$('referral-refresh')?.addEventListener('click',()=>action(refreshReferrals));
$('referral-join')?.addEventListener('click',()=>action(async()=>{if(!$('referral-accept').checked)throw new Error('Read and accept the referral terms first.');await api('/referrals/join',{accepted:true,version:'2026-09-21.1'});await refreshReferrals();status('Referral program joined. Share your link with a clear commission disclosure.');}));
$('referral-payout')?.addEventListener('click',()=>action(async()=>{await api('/referrals/payout',{});await refreshReferrals();status('Payout requested for owner review. No money has been transferred.');}));
$('referral-admin-refresh')?.addEventListener('click',()=>action(async()=>{
 const d=await api('/admin/referral-payouts');const container=$('referral-requests');container.replaceChildren();
 for(const p of d.requests){
  const box=document.createElement('article');box.className='account-card';
  const heading=document.createElement('h3');heading.textContent=p.email+' · '+usd(p.amount);box.append(heading);
  const invoices=document.createElement('p');invoices.textContent='Review invoices in Stripe: '+p.entryIDs.join(', ');box.append(invoices);
  const note=document.createElement('input');note.placeholder='Audit reason / completed payment reference (no private banking data)';note.setAttribute('aria-label','Payout audit note');box.append(note);
  const voids=document.createElement('input');voids.placeholder='If rejected: refunded/ineligible invoice IDs to void, separated by commas';voids.setAttribute('aria-label','Ineligible invoice IDs');box.append(voids);
  const label=document.createElement('label');const checked=document.createElement('input');checked.type='checkbox';label.append(checked,document.createTextNode(' I reviewed invoices, refunds, disputes and payout eligibility.'));box.append(label);
  for(const result of ['paid','rejected']){const button=document.createElement('button');button.textContent=result==='paid'?'Record completed external payout':'Return request for correction';button.addEventListener('click',()=>action(async()=>{await api('/admin/referral-payout',{id:p.id,status:result,note:note.value,reviewed:checked.checked,...(result==='rejected'?{voidInvoiceIDs:voids.value.split(',').map(v=>v.trim()).filter(Boolean)}:{})});box.remove();status(result==='paid'?'External payout recorded.':'Request returned; valid earnings remain available.');}));box.append(button);}
  container.append(box);
 }
 if(!d.requests.length)container.textContent='No payout requests awaiting review.';
}));
