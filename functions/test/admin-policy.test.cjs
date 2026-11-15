const{describe,it}=require("node:test");
const assert=require("node:assert/strict");
const{adminAllowed,validAction,safeMember,monthBuckets}=require("../lib/admin-policy");
describe("D25 privileged administration",()=>{
 const claims={uid:"user_abc",email_verified:true,d25Admin:true,firebase:{sign_in_provider:"google.com"}};
 const user={uid:"user_abc",disabled:false,customClaims:{d25Admin:true}};
 it("requires Google sign-in, verified identity and server-assigned admin role",()=>{
  assert.equal(adminAllowed(claims,user),true);
  for(const c of [{...claims,email_verified:false},{...claims,d25Admin:false},
   {...claims,firebase:{sign_in_provider:"password"}},{...claims,uid:"other"}])
   assert.equal(adminAllowed(c,user),false);
  assert.equal(adminAllowed(claims,{...user,disabled:true}),false);
  assert.equal(adminAllowed(claims,{...user,customClaims:{}}),false);
 });
 it("rejects unconfirmed or unrecognized user mutations",()=>{
  assert.equal(validAction({action:"disableUser",uid:"user_abc",confirm:true}),true);
  assert.equal(validAction({action:"disableUser",uid:"user_abc",confirm:false}),false);
  assert.equal(validAction({action:"makeAdmin",uid:"user_abc",confirm:true}),false);
  assert.equal(validAction({action:"revokeLicense",uid:"../keys",confirm:true}),false);
 });
 it("excludes disabled and revoked accounts from active subscriber counts",()=>{
  const a={paidThroughMs:3000,status:"active"};
  assert.equal(safeMember(user,a,2000).active,true);
  assert.equal(safeMember(user,{...a,revokedAtMs:1000},2000).active,false);
  assert.equal(safeMember({...user,disabled:true},a,2000).active,false);
 });
 it("builds exactly 12 consecutive UTC months",()=>{
  const b=monthBuckets(Date.UTC(2026,10,15));
  assert.equal(b[0].month,"2025-12");assert.equal(b[11].month,"2026-11");
  for(let i=1;i<b.length;i++)assert.equal(b[i-1].to,b[i].from);
 });
});
