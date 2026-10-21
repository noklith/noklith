import { l } from "./index-Cahz09aN.js";
var f = 0;
function u(e, t, n, o, i, u2) {
  t || (t = {});
  var a, c, l$1 = t;
  "ref" in t && (a = t.ref, delete t.ref);
  var p = { type: e, props: l$1, key: n, ref: a, __k: null, __: null, __b: 0, __e: null, __d: void 0, __c: null, constructor: void 0, __v: --f, __i: -1, __u: 0, __source: i, __self: u2 };
  if ("function" == typeof e && (a = e.defaultProps)) for (c in a) void 0 === l$1[c] && (l$1[c] = a[c]);
  return l.vnode && l.vnode(p), p;
}
export {
  u
};
