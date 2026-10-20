// Prefer the API; verified cache and bundled data remain available on failure.
// Set false to restore same-site configuration loading without API/cache access.
export const USE_SERVER_CONFIG=true;
// Development only: e.g. http://127.0.0.1:8787. Production normally stays empty.
export const SERVER_CONFIG_ORIGIN_OVERRIDE='';

export function getServerConfigOptions({enabled=USE_SERVER_CONFIG,location=globalThis.location,
  originOverride=SERVER_CONFIG_ORIGIN_OVERRIDE,clientVersion=''}={}){
  if(!enabled)return null;
  let origin;
  if(originOverride){
    const url=new URL(originOverride);
    const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))throw new Error('Configuration API requires HTTPS');
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Expected a configuration API origin');
    origin=url.origin;
  }else{
    const hostname=location?.hostname;
    if(!hostname||hostname==='localhost'||hostname.endsWith('.localhost')||hostname.includes(':')||/^[\d.]+$/.test(hostname))
      throw new Error('Set a configuration API origin for local development');
    // Keep the entire hostname, including www or a game's own subdomain.
    origin=`https://api.${hostname}`;
  }
  return {origin,clientVersion};
}
