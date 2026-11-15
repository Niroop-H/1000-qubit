/**
 * D25 Windows desktop — genuine local-first engine with Firebase/Cloudflare
 * license authorization. Quantum simulation runs on customer CPU/RAM.
 *
 * IMPORTANT: shipped JavaScript workers are extractable. This is NOT strong
 * proprietary algorithm secrecy; a native Rust engine is still required
 * before claiming meaningful code encapsulation.
 */
import React,{Suspense,lazy,useEffect,useState} from "react";
import ReactDOM from "react-dom/client";
import {ThemeProvider} from "../Theme";
import D25AccountGate from "../D25AccountGate";
import "../index.css";
import "../themes.css";
const DesktopHome=lazy(()=>import("../DesktopHome"));
const Studio=lazy(()=>import("../App").then(m=>({default:m.App})));
const Large=lazy(()=>import("../LargeQuantum"));
const Lab=lazy(()=>import("../lab/Playground"));
const LabOperations=lazy(()=>import("../lab/LabTwin"));
const Sensing=lazy(()=>import("../lab/Sensing"));
const Communication=lazy(()=>import("../lab/Communication"));

function currentRoute(){return window.location.hash.slice(1).split("?")[0].replace(/\/$/,"")||"/";}
function Router(){
 const [path,setPath]=useState(currentRoute);
 useEffect(()=>{
  const onHash=()=>{setPath(currentRoute());window.scrollTo(0,0);};
  const nav=(event:MouseEvent)=>{
   const target=event.target;
   if(!(target instanceof Element)||event.defaultPrevented||event.button!==0||
      event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   const anchor=target.closest<HTMLAnchorElement>("a[href]");
   if(!anchor||anchor.target==="_blank"||anchor.hasAttribute("download"))return;
   const href=anchor.getAttribute("href")||"";
   if(!/^\/(?:$|studio(?:$|\/)|1000-plus(?:$|\/)|lab(?:$|\/)|sensing(?:$|\/)|communication(?:$|\/))/.test(href))return;
   event.preventDefault();
   const next="#"+href;
   if(window.location.hash!==next)window.location.hash=next;
   else onHash();
  };
  window.addEventListener("hashchange",onHash);
  document.addEventListener("click",nav,true);
  return()=>{window.removeEventListener("hashchange",onHash);document.removeEventListener("click",nav,true);};
 },[]);
 const Content=path==="/studio"?Studio:path==="/1000-plus"?Large:
  path==="/lab/operations"?LabOperations:path==="/lab"?Lab:
  path==="/sensing"?Sensing:path==="/communication"?Communication:DesktopHome;
 return <ThemeProvider>
  <D25AccountGate>
   <Suspense fallback={<main style={{minHeight:"100vh",padding:45,background:"#0a1220",color:"#eee"}}>
    Loading your local D25 Quantum Workspace…</main>}>
    <Content/>
   </Suspense>
  </D25AccountGate>
 </ThemeProvider>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
 <React.StrictMode><Router/></React.StrictMode>
);
