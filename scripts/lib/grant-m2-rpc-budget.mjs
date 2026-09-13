// Per-owner component, not a deployed global limiter. Four exclusive owners at
// <=60 CU/s each bound the configured traffic to <=240 CU/s only when every RPC
// call uses its owner's shared gate (including reader polls and health checks).
export function createRpcBudget({owner,totalLimit,restored,persist,now}) {
  const owners=['observer-aws-a','observer-google-e2-micro','observer-oracle-a1','coordinator'];
  if(!owners.includes(owner)||!Number.isSafeInteger(totalLimit)||totalLimit<20||totalLimit>2000000||typeof persist!=='function'||typeof now!=='function') throw Error('Invalid budget configuration');
  const state=restored?structuredClone(restored):{owner,total_limit:totalLimit,spent:0,last_ms:0,recent:[]};
  if(state.owner!==owner||state.total_limit!==totalLimit||!Number.isSafeInteger(state.spent)||state.spent<0||state.spent>totalLimit||
     !Number.isSafeInteger(state.last_ms)||state.last_ms<0||!Array.isArray(state.recent)||
     state.recent.some(r=>!Number.isSafeInteger(r.at)||r.at<0||r.at>state.last_ms||r.cu!==20||typeof r.pending!=='boolean'||!Number.isSafeInteger(r.id)||r.id<20||r.id>state.spent)||
     new Set(state.recent.map(r=>r.id)).size!==state.recent.length||
     state.recent.reduce((n,r)=>n+r.cu,0)>Math.min(60,state.spent)) throw Error('Invalid restored budget');
  let tail=Promise.resolve(),poisoned=false;
  async function reserve() {
    if(poisoned) throw Error('Budget requires reconciliation');
    const at=now();
    if(!Number.isSafeInteger(at)||at<state.last_ms) {poisoned=true;throw Error('Budget clock invalid');}
    state.last_ms=at;
    state.recent=state.recent.filter(r=>r.pending||at-r.at<1000);
    if(state.spent+20>totalLimit) return {allowed:false,reason:'TOTAL_QUOTA'};
    if(state.recent.length>=3) {
      const completed=state.recent.filter(r=>!r.pending);
      const retryAfter=completed.length===state.recent.length
        ? Math.max(1,1000-(at-Math.min(...completed.map(r=>r.at))))
        : 1000;
      return {allowed:false,reason:'RATE_LIMIT',retry_after_ms:retryAfter};
    }
    state.spent+=20;state.recent.push({at,cu:20,id:state.spent,pending:true});
    try {await persist(structuredClone(state));} catch {poisoned=true;throw Error('Quota persistence failed');}
    return {allowed:true,reserved_cu:20,id:state.spent};
  }
  function enqueue(operation) {
    const result=tail.then(operation);tail=result.then(()=>{},()=>{});return result;
  }
  async function call(method,operation) {
      if(!['getHealth','getSignatureStatuses','getBlockHeight','getLatestBlockhash','sendTransaction'].includes(method)||typeof operation!=='function') throw Error('Unbudgeted RPC method');
      const result=await enqueue(reserve);
      if(!result.allowed)return result;
      // Never refund a reservation after transport failure or retry internally.
      try {return {allowed:true,value:await operation()};}
      finally {
        await enqueue(async()=>{
          if(poisoned) throw Error('Budget requires reconciliation');
          const at=now();
          if(!Number.isSafeInteger(at)||at<state.last_ms){poisoned=true;throw Error('Budget clock invalid');}
          state.last_ms=at;
          const row=state.recent.find(r=>r.id===result.id);
          row.at=at;row.pending=false;
          // The reservation stays occupied until one second after completion.
          // Slow persistence/transport cannot bunch delayed starts into a burst.
          try {await persist(structuredClone(state));}catch{poisoned=true;throw Error('Quota persistence failed');}
        });
      }
  }
  return {
    call,
    requiresReconciliation:()=>poisoned,
    async callWhenAvailable(method,operation,{abortSignal,sleep=abortableSleep}={}) {
      if(typeof sleep!=='function') throw Error('Invalid budget wait function');
      while(true) {
        throwIfAborted(abortSignal);
        const result=await call(method,operation);
        if(result.allowed||result.reason!=='RATE_LIMIT') return result;
        throwIfAborted(abortSignal);
        await sleep(result.retry_after_ms,abortSignal);
      }
    },
  };
}

function throwIfAborted(signal) {
  if(!signal?.aborted) return;
  if(signal.reason instanceof Error) throw signal.reason;
  const error=Error('RPC budget wait aborted');error.name='AbortError';throw error;
}

function abortableSleep(milliseconds,signal) {
  return new Promise((resolve,reject)=>{
    throwIfAborted(signal);
    const timer=setTimeout(done,milliseconds);
    function done(){signal?.removeEventListener('abort',aborted);resolve();}
    function aborted(){clearTimeout(timer);signal?.removeEventListener('abort',aborted);try{throwIfAborted(signal);}catch(error){reject(error);}}
    signal?.addEventListener('abort',aborted,{once:true});
  });
}
