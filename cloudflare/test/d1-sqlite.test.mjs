/**
 * Real SQLite verification of the exact D1 quota SQL, using Node 22's
 * experimental built-in sqlite binding. Test all 20 credits, replay rollback,
 * five-hour reset, disabled/refunded/expired accounts, and reserve guards.
 * Cloudflare D1 still needs independent concurrent integration acceptance.
 */
import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {quotaStatements,COOLDOWN_MS,LIMIT} from "../src/policy.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const NOW=Date.UTC(2026,10,15,13);
function setup(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(resolve(root,"migrations/0001_d25_license.sql"),"utf8"));
 db.exec(readFileSync(resolve(root,"migrations/0002_refund_replay.sql"),"utf8"));
 db.prepare("INSERT INTO d25_accounts(uid,email,status,paid_until_ms,created_at_ms,updated_at_ms) "+
  "VALUES(?,?,?,?,?,?)").run("user_abc","test@example.invalid","active",NOW+5*86400000,NOW,NOW);
 return db;
}
let index=0;
const uuid=()=>{const n=(++index).toString(16).padStart(12,"0");return "0b4d6161-4382-48d1-a123-"+n;};
function reserve(db,now,requestId=uuid()){
 const statements=quotaStatements({
  prepare(sql){return {sql,bind(...params){this.params=params;return this;}};}
 },{uid:"user_abc",requestId,now});
 db.exec("BEGIN IMMEDIATE TRANSACTION");
 try{
  const updated=db.prepare(statements[0].sql).all(...statements[0].params);
  const inserted=db.prepare(statements[1].sql).run(...statements[1].params);
  db.exec("COMMIT");
  return{updated,inserted,requestId};
 }catch(e){db.exec("ROLLBACK");throw e;}
}
describe("D25 D1 SQL transactional quota",()=>{
 it("allows 20 unique launches, blocks 21st, resumes after exactly five hours",()=>{
  const db=setup();
  for(let i=0;i<LIMIT;i++){
   const r=reserve(db,NOW+i);
   assert.equal(r.inserted.changes,1);
   assert.equal(r.updated[0].used,i+1);
  }
  assert.equal(reserve(db,NOW+LIMIT).inserted.changes,0);
  const used=db.prepare("SELECT used,reset_at_ms FROM d25_quotas WHERE uid='user_abc'").get();
  assert.equal(used.used,20);
  assert.equal(used.reset_at_ms,NOW+LIMIT-1+COOLDOWN_MS);
  assert.equal(reserve(db,used.reset_at_ms-1).inserted.changes,0);
  const resumed=reserve(db,used.reset_at_ms);
  assert.equal(resumed.inserted.changes,1);
  assert.equal(resumed.updated[0].used,1);
  db.close();
 });
 it("duplicate execution UUID rolls back any quota increment",()=>{
  const db=setup(),id=uuid();
  reserve(db,NOW,id);
  assert.throws(()=>reserve(db,NOW+1,id),/UNIQUE|constraint/i);
  assert.equal(db.prepare("SELECT used FROM d25_quotas").get().used,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d25_reservations").get().n,1);
  db.close();
 });
 it("disabled, refunded and expired accounts are denied at SQL boundary",()=>{
  for(const field of ["disabled","refunded"]){
   const db=setup();
   db.prepare("UPDATE d25_accounts SET "+field+"=1").run();
   assert.equal(reserve(db,NOW).inserted.changes,0);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM d25_reservations").get().n,0);
   db.close();
  }
  const db=setup();
  db.prepare("UPDATE d25_accounts SET paid_until_ms=?").run(NOW-1);
  assert.equal(reserve(db,NOW).inserted.changes,0);
  db.close();
 });
});
