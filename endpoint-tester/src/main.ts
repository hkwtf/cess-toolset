import { parse } from "$std/jsonc/mod.ts";
import { ApiPromise, WsProvider } from "$polkadot-js/api/mod.ts";
import { Keyring } from "$polkadot-js/keyring/mod.ts";
import * as bnjs from "$bn.js";

const APP_CONFIG = "./src/config.jsonc";
const DEV_SEED_PHRASE = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const DEV_ACCTS = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Fredie"];
const API_PREFIX = "api";
const BN = bnjs.BN;

const config = parse(await Deno.readTextFile(APP_CONFIG));
const keyring = new Keyring(config.keyring);

function getTxCall(api: ApiPromise, txStr: string): Function {
  const segs = txStr.split(".");
  return segs.reduce(
    (txCall, seg, idx) => idx === 0 && seg === API_PREFIX ? txCall : txCall[seg],
    api
  );
}

function isWriteOp(txStr: string): boolean {
  return txStr.includes("tx.");
}

function transformParams(params: Array<string>) {
  return params.map(param => {
    if (DEV_ACCTS.includes(param)) {
      const acct = keyring.addFromUri(`${DEV_SEED_PHRASE}//${param}`);
      return acct.address;
    }
    return param;
  });
}

function transformResult(result) {
  return result.toJSON();
}

async function sendTxsToApi(api: ApiPromise, txs) {
  let txStr;
  let lastResult;
  for (const tx of txs) {
    if (typeof tx === "string") {
      txStr = tx;
      const txCall = getTxCall(api, tx);
      lastResult = await txCall.call(txCall);
    } else {
      const { params, sign } = tx;
      txStr = tx.tx;
      const txCall = getTxCall(api, txStr);
      const transformedParams = transformParams(params);

      if (isWriteOp(txStr)) {
        // lastResult is block hash. It hasn't been put in block or finalized yet
        lastResult = await txCall.call(txCall, ...transformedParams).signAndSend(sign);
      } else {
        lastResult = await txCall.call(txCall, ...transformedParams);
      }
    }
    lastResult = transformResult(lastResult);
    console.log(`${txStr}\n  L`, lastResult);
  }
  return lastResult;
}

async function main() {
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
}

main()
  .catch((err) => console.error(err))
  .finally(() => Deno.exit());
