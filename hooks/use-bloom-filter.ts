import BloomFilter from "@/bloom/bloom-filter";
import { Base64String } from "@/utils/Base64String";
import { fetchFromFile, saveToAppDirectory } from "@/utils/file";
import { useEffect, useState } from "react";

const BLOOM_FILE = "bloom.json";

export function useBloomFilter() {
  const [bloomFilter, setBloomFilter] = useState<BloomFilter | null>(null);

  useEffect(() => {
    async function fetchBloomFilter() {
      const json = await fetchFromFile(BLOOM_FILE);
      if (json) {
        console.log("found bloom filter");
        setBloomFilter(BloomFilter.fromJSON(JSON.parse(json)));
      } else {
        console.log("creating new bloom filter");
        setBloomFilter(new BloomFilter(1000, 4));
      }
    }

    fetchBloomFilter();
  }, []); // Empty array - only run once on mount

  const add = (packet: Uint8Array) => {
    bloomFilter?.add(Base64String.fromBytes(packet).getValue());
    const json = JSON.stringify(bloomFilter?.saveAsJSON());
    saveToAppDirectory(json, BLOOM_FILE);
  };

  const has = (packet: Uint8Array): boolean => {
    return bloomFilter
      ? bloomFilter.has(Base64String.fromBytes(packet).getValue())
      : false;
  };

  return { add, has };
}
