// Content definitions contain no running game or renderer dependencies.
// Freeze once at registration; per-frame systems reuse these objects.
export function defineWorld(definition){
  const freeze=value=>{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      for(const item of Object.values(value))freeze(item);Object.freeze(value);
    }
    return value;
  };
  return freeze(definition);
}
