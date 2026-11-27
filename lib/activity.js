const DAY=86400000;
const KEY='portfolio:activity:v1';
export const approved=()=>process.env.ACTIVITY_PUBLIC_APPROVED==='true';
export function normalize(rows,now=new Date()) {
 if(!Array.isArray(rows)||rows.length>10000)throw Error('invalid_heatmap');
 const end=Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z');
 const days={};for(let i=364;i>=0;i--)days[new Date(end-i*DAY).toISOString().slice(0,10)]=0;
 for(const row of rows){const t=row?.timestamp,n=row?.contributions;if(!Number.isSafeInteger(t)||t<0||t>253402300799||!Number.isSafeInteger(n)||n<0)throw Error('invalid_heatmap');const date=new Date(t*1000).toISOString().slice(0,10);if(Object.hasOwn(days,date)){days[date]+=n;if(!Number.isSafeInteger(days[date]))throw Error('invalid_heatmap')}}
 return {updated_at:now.toISOString(),days,metric:'gitea_contributions',timezone:'UTC'};
}
export async function fetchActivity(){
 const {GITEA_BASE_URL,GITEA_USERNAME,GITEA_TOKEN}=process.env;
 if(!GITEA_BASE_URL||!GITEA_USERNAME||!GITEA_TOKEN)throw Error('gitea_not_configured');
 const base=new URL(GITEA_BASE_URL);if(base.origin!=='https://git.benefitz.in'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('invalid_gitea_origin');
 const url=new URL('/api/v1/users/'+encodeURIComponent(GITEA_USERNAME)+'/heatmap',base);
 let response;try{response=await fetch(url,{headers:{Authorization:'token '+GITEA_TOKEN,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw Error('gitea_unreachable')}
 if(!response.ok)throw Error('gitea_http_'+response.status);
 return normalize(await response.json());
}
async function redis(command){const {UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN}=process.env;if(!UPSTASH_REDIS_REST_URL||!UPSTASH_REDIS_REST_TOKEN)throw Error('storage_not_configured');const url=new URL(UPSTASH_REDIS_REST_URL);if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid_storage_url');let r;try{r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),redirect:'error',signal:AbortSignal.timeout(8000)})}catch{throw Error('storage_unreachable')}if(!r.ok)throw Error('storage_http_'+r.status);const data=await r.json();if(data.error||!Object.hasOwn(data,'result'))throw Error('storage_error');return data.result;}
export async function save(snapshot){if(await redis(['SET',KEY,JSON.stringify(snapshot)])!=='OK')throw Error('storage_write_failed');}
export async function load(){const raw=await redis(['GET',KEY]);if(raw===null)return null;const s=JSON.parse(raw);if(s.metric!=='gitea_contributions'||!Number.isFinite(Date.parse(s.updated_at))||!s.days||Object.keys(s.days).length!==365)throw Error('invalid_snapshot');const days={};for(const [date,n] of Object.entries(s.days)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(n)||n<0)throw Error('invalid_snapshot');days[date]=n}return {updated_at:s.updated_at,days,metric:'gitea_contributions',timezone:'UTC'};}
