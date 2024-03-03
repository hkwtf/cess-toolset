import { ApiPromise } from "polkadot-js/api/mod.ts";
import chalk from "chalk";
import type { KeyringPair } from "polkadot-js/keyring/types.ts";

// Our own implementation
import type { TimingRecord, Tx, TxParam } from "./types.ts";

const API_PREFIX = "api";

export function transformParams(params: Array<TxParam>, signers: Map<string, KeyringPair>) {
  return params.map((param) => {
    // if it is a dev account
    if (typeof param === "string" && signers.has(param)) {
      return (signers.get(param) as KeyringPair).address;
    }

    // return its original form
    return param;
  });
}

export function getSigner(
  signerStr: string | undefined,
  signers: Map<string, KeyringPair>,
): KeyringPair {
  if (!signerStr || signerStr.length === 0) {
    throw new Error(`writeOp has no signer specified.`);
  }
  if (!signers.has(signerStr)) {
    throw new Error(`${signerStr} signer is not recognized`);
  }
  return signers.get(signerStr) as KeyringPair;
}

// This function works on polkadot-js api type. It is quite complicated with the dynamic type
//   fetched on-chain.
//   ref: https://polkadot.js.org/docs/api/start/types.basics
// deno-lint-ignore no-explicit-any
export function transformResult(result: any): any {
  if (typeof result === "object" && "toJSON" in result) {
    return result.toJSON();
  }
  return result;
}

export function isWriteOp(tx: Tx): boolean {
  if (typeof tx === "string") return false;
  return tx.tx.includes("tx.");
}

// deno-lint-ignore no-explicit-any
export function getTxCall(api: ApiPromise, txStr: string): any {
  const segs = txStr.split(".");
  return segs.reduce(
    (txCall, seg, idx) => idx === 0 && seg === API_PREFIX ? txCall : txCall[seg],
    // deno-lint-ignore no-explicit-any
    api as Record<string, any>,
  );
}

export function txDisplay(tx: Tx): string {
  const decorate = chalk.underline;
  const em = "🔗";
  let text: string;

  if (typeof tx === "string") {
    text = `${tx}()`;
  } else {
    const paramsStr = tx.params ? tx.params.join(", ") : "";
    text = !tx.signer ? `${tx.tx}(${paramsStr})` : `${tx.tx}(${paramsStr}) | ✍️  ${tx.signer}`;
  }
  return `${em} ${decorate(text)}`;
}

export function stringify(
  result: string | number | boolean | object | Array<unknown>,
  spacing: number = 0,
): string {
  if (Array.isArray(result)) {
    if (result.length > 0 && typeof result[0] === "string") {
      return result.join(`\n${" ".repeat(spacing)}`);
    }
    // an array of object or empty array
    return JSON.stringify(result, undefined, 2);
  }

  if (typeof result === "object") {
    return JSON.stringify(result, undefined, 2);
  }

  return result.toString();
}

export function displayTimingReport(timings: TimingRecord): void {
  const log = console.log;
  const mainTitle = chalk.bold.yellowBright.inverse;
  const catTitle = chalk.bgBlack.yellow;
  const keyF = chalk.cyan;
  const valF = chalk.whiteBright;

  const displayStartEnd = (timings: TimingRecord, key: string) => {
    log(`  ${keyF("time taken")}: ${valF(timings[key + "End"] - timings[key + "Start"])}`);
  };

  log();
  log(mainTitle("--- Timing Report ---"));

  log(catTitle("Connecting to all endpoints"));
  displayStartEnd(timings, "allConn");

  log(catTitle("Executing all transactions"));
  displayStartEnd(timings, "allTxs");
}
