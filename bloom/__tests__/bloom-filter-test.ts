import BloomFilter from "../bloom-filter";

test("bloom filter lib", () => {
  const filter = new BloomFilter(10, 2);
  filter.add("bob");
  filter.add("alice");

  // lookup for some data
  expect(filter.has("bob")).toEqual(true);
  expect(filter.has("daniel")).toEqual(false);

  // print the error rate
  console.log(filter.rate());

  const json = filter.saveAsJSON();

  console.log(json);
});
