import { parse } from "$std/jsonc/mod.ts";
import { ApiPromise, WsProvider } from "$polkadot-js/api/mod.ts";

async function sendTxsToApi(api: ApiPromise, txs) {
  let lastResult;
  for (const txStr of txs) {
    if (typeof txStr === "string") {
      const segs = txStr.split(".");
      const txObj = segs.reduce((txObj, seg) => txObj[seg], api);
      lastResult = await txObj.call();
    }
  }
  return lastResult;
}

async function main() {
  const config = parse(await Deno.readTextFile("./src/config.jsonc"));

  const { endPoints, connections, txs } = config;

  const connArr = endPoints.reduce(
    (memo, ep) => memo.concat([...Array(connections).keys()].map(() => ep)),
    [],
  );

  const apiPromises = connArr.map((ep) => ApiPromise.create({ provider: new WsProvider(ep) }));
  let results = await Promise.allSettled(apiPromises);

  const apis = results.reduce((memo, res, idx) => {
    if (res.status === "fulfilled") return memo.concat([res.value]);
    console.log(`Connection rejected: ${connArr[idx]}`);
    return memo;
  }, []);

  results = await Promise.allSettled(
    apis.map((api) => sendTxsToApi(api, txs)),
  );

  console.log(`results:`, results);
}

main()
  .catch((err) => console.error(err))
  .finally(() => Deno.exit());
