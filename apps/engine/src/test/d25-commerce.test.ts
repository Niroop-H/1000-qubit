import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {
 D25_NAMED_USER_AMOUNT_PAISE,D25_NAMED_USER_PRICE_INR,
 verifyRazorpayCheckoutSignature,verifyRazorpayWebhook,
 isExpectedCapturedPayment
} from "../commerce/d25-razorpay";

const secret="D25-test-secret-only-not-a-real-razorpay-credential";
const orderId="order_Aa123abc";
const paymentId="pay_123Abcd";

describe("D25 Razorpay commerce safety primitives (no live charges)",()=>{
 it("sets the advertised named-user price to 500 INR / 50000 paise",()=>{
  assert.equal(D25_NAMED_USER_PRICE_INR,500);
  assert.equal(D25_NAMED_USER_AMOUNT_PAISE,50000);
 });
 it("accepts an authentic checkout signature only for the saved order",()=>{
  const signature=createHmac("sha256",secret).update(orderId+"|"+paymentId).digest("hex");
  assert.equal(verifyRazorpayCheckoutSignature({orderId,paymentId,signature},secret),true);
  assert.equal(verifyRazorpayCheckoutSignature({orderId:"order_Different",paymentId,signature},secret),false);
  assert.equal(verifyRazorpayCheckoutSignature({orderId,paymentId,signature:"00".repeat(32)},secret),false);
  assert.equal(verifyRazorpayCheckoutSignature({orderId,paymentId,signature:"not-hex"},secret),false);
  assert.equal(verifyRazorpayCheckoutSignature({orderId,paymentId,signature},""),false);
 });
 it("verifies only the exact raw webhook bytes and matching secret",()=>{
  const raw=Buffer.from('{"event":"payment.captured","id":"evt123"}');
  const signature=createHmac("sha256",secret).update(raw).digest("hex");
  assert.equal(verifyRazorpayWebhook(raw,signature,secret),true);
  assert.equal(verifyRazorpayWebhook(Buffer.from(raw.toString()+" "),signature,secret),false);
  assert.equal(verifyRazorpayWebhook(raw,signature,"different-sufficiently-long-secret"),false);
  assert.equal(verifyRazorpayWebhook(raw,signature.slice(2),secret),false);
  assert.equal(verifyRazorpayWebhook(Buffer.alloc(128*1024+1),signature,secret),false);
 });
 it("only recognizes captured, correctly priced, matching INR transactions",()=>{
  const good={id:paymentId,order_id:orderId,status:"captured",currency:"INR",amount:50000};
  assert.equal(isExpectedCapturedPayment(good,orderId),true);
  for(const mutation of [
   {status:"authorized"},{status:"refunded"},{amount:1},{amount:49999},
   {amount:50001},{currency:"USD"},{order_id:"order_other"},{id:"invalid"}
  ]){
   assert.equal(isExpectedCapturedPayment({...good,...mutation},orderId),false);
  }
  assert.equal(isExpectedCapturedPayment(good,"order_another"),false);
  assert.equal(isExpectedCapturedPayment(null,orderId),false);
 });
});
