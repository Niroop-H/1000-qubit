/**
 * D25 Razorpay TEST subscription plan bootstrap.
 *
 * Never uses live keys; never charges customers.
 *   node scripts/d25-razorpay-test-plan.mjs verify
 *   node scripts/d25-razorpay-test-plan.mjs create
 * Create requires D25_CONFIRM_TEST_PLAN_CREATE=YES_TEST_PLAN_ONLY.
 */
const action=process.argv[2]??"verify";
if(!["verify","create"].includes(action)||process.argv.length>3)
 throw Error("Usage: node scripts/d25-razorpay-test-plan.mjs verify|create");
const id=process.env.D25_RAZORPAY_TEST_KEY_ID??"";
const secret=process.env.D25_RAZORPAY_TEST_KEY_SECRET??"";
if(!/^rzp_test_[A-Za-z0-9]+$/.test(id)||secret.length<16)
 throw Error("Only Razorpay TEST credentials are accepted. Set TEST credentials in the server shell; never commit them.");
if(process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")||
   process.env.D25_RAZORPAY_LIVE_KEY_ID||process.env.D25_ENABLE_LIVE_BILLING==="true")
 throw Error("Live-mode configuration detected; test-plan creation is blocked.");
if(action==="create"&&process.env.D25_CONFIRM_TEST_PLAN_CREATE!=="YES_TEST_PLAN_ONLY")
 throw Error("Creating a test plan changes the Razorpay TEST dashboard. Confirm D25_CONFIRM_TEST_PLAN_CREATE=YES_TEST_PLAN_ONLY.");
const planId=process.env.D25_RAZORPAY_PLAN_ID_TEST??"";
if(action==="verify"&&!/^plan_[A-Za-z0-9]+$/.test(planId))
 throw Error("Set D25_RAZORPAY_PLAN_ID_TEST to the existing Razorpay TEST plan ID.");
if(action==="create"&&planId)
 throw Error("A plan ID is already configured. Verify the existing plan instead of creating a duplicate.");
const path=action==="verify"?"/plans/"+encodeURIComponent(planId):"/plans";
const response=await fetch("https://api.razorpay.com/v1"+path,{
 method:action==="verify"?"GET":"POST",
 headers:{"Authorization":"Basic "+Buffer.from(id+":"+secret).toString("base64"),
  "Accept":"application/json","Content-Type":"application/json"},
 ...(action==="create"?{body:JSON.stringify({
  period:"monthly",interval:1,item:{
   name:"D25 Quantum Workspace - 1 Named User TEST",
   amount:50000,currency:"INR",
   description:"INR 500 per user monthly. Test authorization only."
  },notes:{product:"D25 Quantum Workspace",mode:"test"}
 })}:{}),
 signal:AbortSignal.timeout(15000)
});
if(!response.ok)
 throw Error("Razorpay TEST API refused this plan request (HTTP "+response.status+"). Check API access and account Subscriptions capability.");
const result=await response.json();
if(!/^plan_[A-Za-z0-9]+$/.test(result?.id??"")||
 result.period!=="monthly"||result.interval!==1||
 result.item?.amount!==50000||result.item?.currency!=="INR")
 throw Error("Unexpected provider plan configuration. D25 will not accept it.");
console.log("D25 Razorpay TEST plan validated: INR 500.00 / named user / month.");
console.log("Test plan ID (not secret): "+result.id);
console.log("Configure D25_RAZORPAY_PLAN_ID_TEST in the dedicated Firebase Functions project.");
console.log("No customer charge occurred. Live billing remains disabled.");
