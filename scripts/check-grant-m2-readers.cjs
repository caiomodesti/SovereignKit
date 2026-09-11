// Read-only RPC preflight from an observer; prints no endpoint or credentials.
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync('/etc/sovereignkit/readers.json','utf8'));
(async () => {
  const rows=[];
  for (const reader of config.readers) {
    for (const [method,params] of [['getHealth',[]],['getGenesisHash',[]],['getBlockHeight',[]],['getSignatureStatuses',[['1'.repeat(64)],{searchTransactionHistory:true}]]]) {
      let ok=false, status=null;
      try {
        const response=await fetch(reader.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
        status=response.status;
        const data=await response.json();
        const value=data.result;
        ok=response.ok && !data.error && (method==='getHealth' ? value==='ok' : method==='getGenesisHash' ? value==='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' : method==='getBlockHeight' ? Number.isSafeInteger(value)&&value>0 : Array.isArray(value?.value)&&value.value.length===1);
      } catch {}
      rows.push({reader_id:reader.readerId,method,http_status:status,ok});
    }
  }
  console.log(JSON.stringify({status:rows.every(row=>row.ok)?'PASS':'FAIL',captured_at:new Date().toISOString(),rows,scope:'RPC_METHOD_AVAILABILITY_ONLY',rehearsal_started:false,milestone_2_started:false}));
  if(rows.some(row=>!row.ok)) process.exitCode=1;
})();
