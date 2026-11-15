/**
 * D25 Quantum Workspace commerce validation primitives.
 *
 * These helpers DO NOT accept payment, issue licences or authorize execution.
 * Call only on trusted MAH Quantum servers, never from the downloadable client.
 *
 * Developer: Devashri S Industries, a division of MAH Quantum.
 * Parent company and original software copyright holder: MAH Quantum.
 */
import {createHmac, timingSafeEqual} from "node:crypto";

export const D25_NAMED_USER_PRICE_INR=500;
export const D25_NAMED_USER_AMOUNT_PAISE=50000;
export const D25_NAMED_USER_CURRENCY="INR" as const;
export const D25_NAMED_USER_SKU="d25-named-user-v1" as const;

type CheckoutProof={
  orderId:string;
  paymentId:string;
  signature:string;
};

export interface CapturedPayment{
  id:string;
  order_id:string;
  status:string;
  currency:string;
  amount:number;
}

function safeHexComparison(provided:unknown,expected:Buffer):boolean{
  if(typeof provided!=="string"||!/^[0-9a-f]{64}$/i.test(provided))return false;
  const actual=Buffer.from(provided,"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

/** Checkout callback proves authenticity, not that the payment was CAPTURED.
 * ALWAYS retrieve payment status from Razorpay on the server before entitlement.
 * The orderId must be the persisted server-created order, not a client claim.
 */
export function verifyRazorpayCheckoutSignature(
 proof:CheckoutProof,serverSecret:string
):boolean{
  if(typeof serverSecret!=="string"||serverSecret.length<16)return false;
  if(!/^order_[a-zA-Z0-9]+$/.test(proof?.orderId??"")||
     !/^pay_[a-zA-Z0-9]+$/.test(proof?.paymentId??""))return false;
  const expected=createHmac("sha256",serverSecret)
    .update(proof.orderId+"|"+proof.paymentId,"utf8").digest();
  return safeHexComparison(proof.signature,expected);
}

/** Razorpay signs the RAW webhook body, before JSON parsing or normalizing.
 * Deduplicate the x-razorpay-event-id header in persistent database storage.
 * Webhook signature must use a distinct server-side WEBHOOK secret.
 */
export function verifyRazorpayWebhook(
 rawBody:Buffer,signature:string,webhookSecret:string
):boolean{
  if(!Buffer.isBuffer(rawBody)||rawBody.length===0||rawBody.length>128*1024||
     typeof webhookSecret!=="string"||webhookSecret.length<16)return false;
  const expected=createHmac("sha256",webhookSecret).update(rawBody).digest();
  return safeHexComparison(signature,expected);
}

/** Fail closed on refunds/partial/authorized payments and on an unexpected
 * price, currency, payment ID or order. Never trust fields from checkout UI.
 */
export function isExpectedCapturedPayment(
 value:unknown,expectedOrderId:string
):value is CapturedPayment {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const payment=value as Record<string,unknown>;
  return typeof expectedOrderId==="string"&&/^order_[a-zA-Z0-9]+$/.test(expectedOrderId)&&
    typeof payment.id==="string"&&/^pay_[a-zA-Z0-9]+$/.test(payment.id)&&
    payment.order_id===expectedOrderId&&payment.status==="captured"&&
    payment.currency===D25_NAMED_USER_CURRENCY&&
    payment.amount===D25_NAMED_USER_AMOUNT_PAISE;
}
