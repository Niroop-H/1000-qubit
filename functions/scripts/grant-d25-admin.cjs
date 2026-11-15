"use strict";
// Run with trusted Application Default Credentials; never from the client.
// GOOGLE_CLOUD_PROJECT=<dedicated-project> D25_ADMIN_GRANT_CONFIRM=<uid> node scripts/grant-d25-admin.cjs verified@yourdomain
const{initializeApp}=require("firebase-admin/app");
const{getAuth}=require("firebase-admin/auth");
async function main(){
 const email=process.argv[2],project=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT;
 if(!email||!/.+@.+\..+/.test(email)||process.argv.length!==3||!project)
  throw Error("Specify the verified Google user's email and GOOGLE_CLOUD_PROJECT.");
 initializeApp({projectId:project});
 const user=await getAuth().getUserByEmail(email);
 if(!user.emailVerified||user.disabled||!user.providerData.some(p=>p.providerId==="google.com"))
  throw Error("Admin candidate must be an enabled, verified Firebase Google account.");
 if(process.env.D25_ADMIN_GRANT_CONFIRM!==user.uid)
  throw Error("No changes made. Set D25_ADMIN_GRANT_CONFIRM to UID: "+user.uid);
 await getAuth().setCustomUserClaims(user.uid,{...(user.customClaims||{}),d25Admin:true});
 console.log("Granted D25 admin role to UID "+user.uid+". Sign out and back in to refresh.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
