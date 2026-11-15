"use strict";
/**
 * D25 administrator HTTPS console.
 * Trusted server-only access; a Google login ALONE never grants admin access.
 * Admin role is issued only from a privileged operator script.
 */
const{randomUUID}=require("node:crypto");
const{FieldPath,AggregateField}=require("firebase-admin/firestore");
const{adminAllowed,validAction,safeMember,monthBuckets}=require("./lib/admin-policy");
const ACCOUNTS="d25Accounts",CHARGES="d25Charges",AUDIT="d25AdminAudit";
const LIMIT=50;
function failure(status,message){const e=new Error(message);e.httpStatus=status;return e;}
function json(res,status,data){
 res.set("Cache-Control","private, no-store");
 res.set("X-Content-Type-Options","nosniff");
 return res.status(status).json(data);
}
function exactCors(req,res){
 const origin=String(req.headers.origin||"");
 const allowed=(process.env.D25_ADMIN_ALLOWED_ORIGINS||"").split(",").map(s=>s.trim()).filter(Boolean);
 if(origin&&!allowed.includes(origin))return false;
 if(origin){res.set("Access-Control-Allow-Origin",origin);res.set("Vary","Origin");
  res.set("Access-Control-Allow-Headers","Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  res.set("Access-Control-Max-Age","300");}
 return true;
}
function safeToken(req){
 const raw=req.headers.authorization;
 if(typeof raw!=="string"||!/^Bearer [A-Za-z0-9._-]{100,6000}$/.test(raw))
  throw failure(401,"Login required.");
 return raw.slice(7);
}
function viewCursor(raw){
 if(!raw)return null;
 if(typeof raw!=="string"||raw.length>700||!/^[A-Za-z0-9_-]+$/.test(raw))
  throw failure(400,"Invalid page cursor.");
 try{
  const c=JSON.parse(Buffer.from(raw,"base64url").toString("utf8"));
  if(typeof c.ms!=="number"||!Number.isSafeInteger(c.ms)||c.ms<0||
      typeof c.uid!=="string"||!/^[A-Za-z0-9_-]{3,128}$/.test(c.uid))
   throw Error("Invalid cursor");
  return c;
 }catch{throw failure(400,"Invalid page cursor.");}
}
const encodeCursor=(v)=>Buffer.from(JSON.stringify(v)).toString("base64url");
async function overview(db){
 const now=Date.now(),months=monthBuckets(now),acc=db.collection(ACCOUNTS),payments=db.collection(CHARGES);
 const [activeSnap,accountsSnap,...income]=await Promise.all([
  acc.where("paidThroughMs",">",now).count().get(),acc.count().get(),
  ...months.map(m=>payments.where("receivedAtMs",">=",m.from)
    .where("receivedAtMs","<",m.to).aggregate({
      charges:AggregateField.count(),capturedPaise:AggregateField.sum("amountPaise")
    }).get())
 ]);
 const collected=months.map((m,i)=>{
  const r=income[i].data();
  return{month:m.month,transactions:Number(r.charges||0),
   grossInr:Number(r.capturedPaise||0)/100};
 });
 const newCheckoutAccounts=await Promise.all(months.map(m=>
  acc.where("createdAtMs",">=",m.from).where("createdAtMs","<",m.to).count().get()));
 collected.forEach((month,i)=>{month.checkoutAccounts=Number(newCheckoutAccounts[i].data().count||0);});
 const activePaidCandidates=Number(activeSnap.data().count||0);
 // Includes recently revoked or disabled accounts: dashboard must not
 // misrepresent this as exactly active customers.
 return{schema:"D25-Admin-Overview/v1",asOf:new Date(now).toISOString(),
  subscriptionAccounts:Number(accountsSnap.data().count||0),
  unexpiredPaidRecords:activePaidCandidates,
  mrrUpperBoundInr:activePaidCandidates*500,
  collectedGrossInr12Months:collected.reduce((sum,m)=>sum+m.grossInr,0),
  charges12Months:collected.reduce((sum,m)=>sum+m.transactions,0),
  months:collected,
  limitations:[
   "Unexpired paid records can include disabled/revoked users: MRR is an upper-bound estimate, not verified recurring income.",
   "Payment chart reflects recorded captured charge documents only, before fees, refunds and tax adjustments.",
   "New checkout accounts counts users who started a subscription checkout, not every Firebase registration.",
   "Traffic, conversion and acquisition-source analytics are not connected; no visitor numbers are inferred."
  ]};
}
async function members(db,auth,req){
 const params=new URL(req.url,"https://admin.invalid").searchParams;
 const search=(params.get("search")||"").trim(),scope=params.get("scope")||"all",at=Date.now();
 if(search){
  if(search.length>200)throw failure(400,"Search too long.");
  let u;
  try{u=search.includes("@")?await auth.getUserByEmail(search):await auth.getUser(search);}
  catch(e){if(e.code==="auth/user-not-found")return{users:[],nextCursor:null};throw e;}
  const data=(await db.collection(ACCOUNTS).doc(u.uid).get()).data()||{};
  return{users:[safeMember(u,data,at)],nextCursor:null};
 }
 if(scope==="active"){
  const cursor=viewCursor(params.get("cursor"));
  let query=db.collection(ACCOUNTS).where("paidThroughMs",">",at)
   .orderBy("paidThroughMs","desc").orderBy(FieldPath.documentId(),"desc").limit(LIMIT);
  if(cursor)query=query.startAfter(cursor.ms,cursor.uid);
  const snap=await query.get();
  const authResult=snap.empty?{users:[]}:
   await auth.getUsers(snap.docs.map(d=>({uid:d.id})));
  const byId=new Map(authResult.users.map(u=>[u.uid,u]));
  const users=snap.docs.filter(d=>byId.has(d.id))
   .map(d=>safeMember(byId.get(d.id),d.data(),at)).filter(u=>u.active);
  const last=snap.docs.at(-1);
  return{users,nextCursor:snap.size===LIMIT&&last?
   encodeCursor({ms:last.get("paidThroughMs"),uid:last.id}):null,
   note:"Active results exclude revoked and disabled users. A page may contain fewer than 50 active rows."};
 }
 if(scope!=="all")throw failure(400,"Unknown user list scope.");
 const page=params.get("cursor")||undefined;
 if(page&&(!/^[A-Za-z0-9_+=/-]{8,1500}$/.test(page)))throw failure(400,"Invalid account cursor.");
 const result=await auth.listUsers(LIMIT,page);
 const snapshots=result.users.length?
  await db.getAll(...result.users.map(u=>db.collection(ACCOUNTS).doc(u.uid))):[];
 return{users:result.users.map((u,i)=>safeMember(u,snapshots[i]?.data()||{},at)),
  nextCursor:result.pageToken||null};
}
async function logs(db){
 const snap=await db.collection(AUDIT).orderBy("atMs","desc").limit(25).get();
 return{events:snap.docs.map(x=>({id:x.id,...x.data()}))};
}
async function act(db,auth,actor,body,cancelSubscription){
 if(!validAction(body))throw failure(400,"Explicit valid action, user ID and confirmation required.");
 const {action,uid}=body;
 if(uid===actor.uid)throw failure(403,"Administrators cannot modify their own account.");
 const user=await auth.getUser(uid);
 if(user.customClaims?.d25Admin)throw failure(403,"Other administrators cannot be modified from this console.");
 const ref=db.collection(ACCOUNTS).doc(uid),existing=(await ref.get()).data()||{};
 if(action==="cancelRenewal"&&!existing.subscriptionId)
  throw failure(409,"No Razorpay subscription is linked to this account.");
 const at=Date.now(),audit=db.collection(AUDIT).doc(randomUUID());
 await audit.create({atMs:at,actorUid:actor.uid,targetUid:uid,action,state:"requested"});
 try{
  if(action==="disableUser"&&user.disabled!==true)await auth.updateUser(uid,{disabled:true});
  if(action==="enableUser"&&user.disabled===true)await auth.updateUser(uid,{disabled:false});
  if(action==="cancelRenewal")await cancelSubscription({uid});
  if(action==="revokeLicense"){
   // Stop future auto-debits before revoking access to prevent billing a user
   // who can no longer use the product. If cancellation fails, do not revoke.
   if(existing.subscriptionId)await cancelSubscription({uid});
   await ref.set({revokedAtMs:at,status:"revoked",paidThroughMs:0,updatedAtMs:at},{merge:true});
  }
  await audit.update({state:"completed",completedAtMs:Date.now()});
  return{success:true,action,uid};
 }catch(e){
  await audit.update({state:"failed",completedAtMs:Date.now()}).catch(()=>{});
  throw e;
 }
}
function adminHandler({onRequest,auth,db,cancelSubscription,region="asia-south1",secrets=[]}){
 return onRequest({region,timeoutSeconds:60,memory:"512MiB",maxInstances:5,secrets,invoker:"public"},async(req,res)=>{
  if(!exactCors(req,res))return json(res,403,{error:"origin_not_allowed"});
  if(req.method==="OPTIONS")return res.status(204).end();
  const route=req.path.replace(/\/$/,"").split("/").pop();
  const methods={overview:"GET",users:"GET",audit:"GET",action:"POST"};
  if(!Object.hasOwn(methods,route)||req.method!==methods[route])
   return json(res,405,{error:"method_not_allowed"});
  if(req.method==="POST"&&(Number(req.headers["content-length"]||0)>2048||
    req.headers["content-type"]?.split(";")[0]?.trim()!=="application/json"))
   return json(res,415,{error:"invalid_content_type_or_size"});
  try{
   const claims=await auth.verifyIdToken(safeToken(req),true);
   const actor=await auth.getUser(claims.uid);
   if(!adminAllowed(claims,actor))throw failure(403,"Google sign-in and D25 administrator role required.");
   let result;
   if(route==="overview")result=await overview(db);
   if(route==="users")result=await members(db,auth,req);
   if(route==="audit")result=await logs(db);
   if(route==="action")result=await act(db,auth,actor,req.body,cancelSubscription);
   return json(res,200,result);
  }catch(e){
   const code=Number.isInteger(e.httpStatus)?e.httpStatus:500;
   if(code===500)console.error("D25 admin server operation failed",e?.name||"Error");
   return json(res,code,{error:code===500?"admin_service_unavailable":e.message});
  }
 });
}
module.exports={adminHandler};
