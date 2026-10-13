export function seedFor(value){let seed=2166136261;for(const char of String(value))seed=Math.imul(seed^char.charCodeAt(0),16777619);return seed>>>0;}
export function randomFor(seed){let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
