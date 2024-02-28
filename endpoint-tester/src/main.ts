import { parse } from "std/jsonc/mod.ts";
import { ApiPromise, WsProvider } from "polkadot-js/api/mod.ts";
import { Keyring } from "polkadot-js/keyring/mod.ts";
import { Mutex, withTimeout } from "async-mutex";
import type { KeyringPair } from "polkadot-js/keyring/types.ts";
import type { ISubmittableResult } from "polkadot-js/types/types/index.ts";

// Our own implementation
import { getSigner, isWriteOp, transformParams, transformResult } from "./utils.ts";
import type { AppConfig, Tx } from "./types.ts";

const APP_CONFIG_PATH = "./src/config.jsonc";
const API_PREFIX = "api";

const config: AppConfig = parse(await Deno.readTextFile(APP_CONFIG_PATH)) as unknown as AppConfig;
const keyring = new Keyring(config.keyring);

// For keeping track of user nonce when spitting out txs
// The mutex in 5 sec.
const mutex = withTimeout(new Mutex(), 5000, new Error("mutex timeout"));
const userNonces: Map<string, number> = new Map();

function getTxCall(api: ApiPromise, txStr: string): any {
  const segs = txStr.split(".");
  return segs.reduce(
    // @ts-ignore: traversing the ApiPromise need quite some types manipulation and understanding
    //   polkadot-js type.
    //   https://github.com/polkadot-js/build-deno.land/blob/master/api-base/types
    //   Future todo.
    (txCall, seg, idx) => idx === 0 && seg === API_PREFIX ? txCall : txCall[seg],
    api,
  );
}

function userNonceKey(api: ApiPromise, signer: KeyringPair): string {
  const rt = api.runtimeVersion;
  return `${rt.specName}-${rt.specVersion}/${signer.address}`;
}

function setUserNonce(api: ApiPromise, signer: KeyringPair, nonce: number): void {
  const key = userNonceKey(api, signer);
  userNonces.set(key, nonce);
}

async function getUserNonce(api: ApiPromise, signer: KeyringPair): Promise<number> {
  const key = userNonceKey(api, signer);
  if (userNonces.has(key)) return userNonces.get(key) as number;

  const nonce = await api.rpc.system.accountNextIndex(signer.address) as unknown as number;
  setUserNonce(api, signer, nonce);
  return nonce;
}

async function sendTxsToApi(api: ApiPromise, txs: Array<Tx>) {
  let txStr;
  let lastResult;

  for (const tx of txs) {
    if (typeof tx === "string") {
      txStr = tx;
      const txCall = getTxCall(api, tx);
      lastResult = await txCall.call(txCall);
    } else if (!isWriteOp(tx)) {
      // tx is an Object but is a readOp
      txStr = tx.tx;
      const txCall = getTxCall(api, txStr);
      const transformedParams = Array.isArray(tx.params) ? transformParams(keyring, tx.params) : [];

      lastResult = await txCall.call(txCall, ...transformedParams);
    } else {
      // tx is a writeOp
      txStr = tx.tx;
      const txCall = getTxCall(api, txStr);
      const transformedParams = Array.isArray(tx.params) ? transformParams(keyring, tx.params) : [];

      if (!tx.sign || tx.sign.length === 0) {
        throw new Error(`${txStr} writeOp has no signer specified.`);
      }

      const signer = getSigner(keyring, tx.sign);

      const release = await mutex.acquire();
      let nonce = await getUserNonce(api, signer);

      console.log(`user: ${signer.address}, nonce: ${nonce}`);

      if (!config.writeTxWait || config.writeTxWait === "none") {
        const txReceipt = await txCall.call(txCall, ...transformedParams).signAndSend(signer, {
          nonce: nonce++,
        });
        setUserNonce(api, signer, nonce);

        lastResult = `txReceipt: ${txReceipt}`;
      } else {
        lastResult = await new Promise((resolve, reject) => {
          txCall.call(txCall, ...transformedParams).signAndSend(
            signer,
            { nonce: nonce++ },
            (res: ISubmittableResult) => {
              if (config.writeTxWait === "inBlock" && res.status.isInBlock) {
                resolve(`inBlock: ${res.status.asInBlock}`);
              }
              if (config.writeTxWait === "finalized" && res.status.isFinalized) {
                resolve(`finalized: ${res.status.asFinalized}`);
              }
            },
          );

          setUserNonce(api, signer, nonce);
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
  const connArr: string[] = endPoints.reduce(
    (memo, ep) => memo.concat([...Array(connections).keys()].map(() => ep)),
    [] as string[],
  );

  const apiPromises: Promise<ApiPromise>[] = connArr.map((ep) =>
    ApiPromise.create({ provider: new WsProvider(ep) })
  );

  let results = await Promise.allSettled(apiPromises);

  const apis = results.reduce(
    (memo, res, idx) => {
      if (res.status === "fulfilled") return memo.concat([res.value]);
      console.log(`Connection rejected: ${connArr[idx]}`);
      return memo;
    },
    [] as Array<ApiPromise>,
  );

  results = await Promise.allSettled(
    apis.map((api) => sendTxsToApi(api, txs)),
  );
}

main()
  .catch(console.error)
  .finally(() => Deno.exit());
