import { parse } from "$std/jsonc/mod.ts";
import { ApiPromise, WsProvider } from "$polkadot-js/api/mod.ts";
import { Keyring } from "$polkadot-js/keyring/mod.ts";

const APP_CONFIG = "./src/config.jsonc";
const DEV_SEED_PHRASE = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const DEV_ACCTS = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Fredie"];
const API_PREFIX = "api";

const config = parse(await Deno.readTextFile(APP_CONFIG));
const keyring = new Keyring(config.keyring);

function getTxCall(api: ApiPromise, txStr: string): Function {
  const segs = txStr.split(".");
  return segs.reduce(
    (txCall, seg, idx) => idx === 0 && seg === API_PREFIX ? txCall : txCall[seg],
    api,
  );
}

function isWriteOp(txStr: string): boolean {
  return txStr.includes("tx.");
}

function transformParams(params: Array<string>) {
  return params.map((param) => {
    if (DEV_ACCTS.includes(param)) {
      const acct = keyring.addFromUri(`${DEV_SEED_PHRASE}//${param}`);
      return acct.address;
    }
    return param;
  });
}

function transformResult(result) {
  if (typeof result === "object" && "toJSON" in result) {
    return result.toJSON();
  }
  return result;
}

function getSigner(signerStr: string) {
  if (DEV_ACCTS.includes(signerStr)) {
    return keyring.addFromUri(`${DEV_SEED_PHRASE}//${signerStr}`);
  }
  return keyring.addFromUri(signerStr);
}

async function sendTxsToApi(api: ApiPromise, txs) {
  let txStr;
  let lastResult;
  for (const tx of txs) {
    if (typeof tx === "string") {
      txStr = tx;
      const txCall = getTxCall(api, tx);
      lastResult = await txCall.call(txCall);
    } else if (!isWriteOp(tx.tx)) {
      // tx is an Object but is a readOp
      txStr = tx.tx;
      const txCall = getTxCall(api, txStr);
      const transformedParams = transformParams(tx.params);
      lastResult = await txCall.call(txCall, ...transformedParams);
    } else {
      // tx is a writeOp
      txStr = tx.tx;
      const txCall = getTxCall(api, txStr);
      const transformedParams = transformParams(tx.params);
      const signer = getSigner(tx.sign);

      if (!config.writeTxWait || config.writeTxWait === "none") {
        const txReceipt = await txCall.call(txCall, ...transformedParams).signAndSend(signer);
        lastResult = `txReceipt: ${txReceipt}`;
      } else {
        lastResult = await new Promise((resolve, reject) => {
          txCall.call(txCall, ...transformedParams).signAndSend(signer, (res) => {
            if (config.writeTxWait === "inBlock" && res.status.isInBlock) {
              resolve(`inBlock: ${res.status.asInBlock}`);
            }
            if (config.writeTxWait === "finalized" && res.status.isFinalized) {
              resolve(`finalized: ${res.status.asFinalized}`);
            }
          });
        });
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
  .catch(console.error)
  .finally(() => Deno.exit());
