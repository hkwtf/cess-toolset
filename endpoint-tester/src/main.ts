import { load } from "$std/dotenv/mod.ts";
import { ApiPromise, WsProvider } from '$polkadot-js/api/mod.ts';

const env = await load();

const provider = new WsProvider(env.RPC_ENDPOINT);
const api = await ApiPromise.create({ provider });

console.log(`hash: ${api.genesisHash.toHex()}`);
