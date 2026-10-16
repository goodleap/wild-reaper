// Legacy "full" links still enter diagnostics. Unrelated truthy strings do not.
// Keep URL detection independent of game modules so startup can share it.
export function isDebugEnabled(search='') {
  const params=search instanceof URLSearchParams?search:new URLSearchParams(search);
  const value=params.get('debug')?.toLowerCase();
  return value==='full'||value===''||value==='1'||value==='true';
}
