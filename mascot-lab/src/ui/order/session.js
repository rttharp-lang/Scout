// The last submit result, handed from Review to Done for this page load (Done falls
// back to state.order + the local copy after a reload).
let last = null;
export const setLastResult = (r) => { last = r || null; };
export const getLastResult = (ref) => (last && (!ref || last.ref === ref) ? last : null);
