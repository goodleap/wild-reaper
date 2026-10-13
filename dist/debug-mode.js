// Only an explicit query flag enables diagnostics; unrelated truthy strings
// never turn an ordinary run into a testing session.
export function debugConfigFromSearch(search='') {
  const params=search instanceof URLSearchParams?search:new URLSearchParams(search);
  const value=params.get('debug')?.toLowerCase();
  const full=value==='full';
  return Object.freeze({enabled:full||value===''||value==='1'||value==='true',full});
}
