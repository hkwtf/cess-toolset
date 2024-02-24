import { load } from '$std/dotenv/mod.ts';
import { parse } from '$std/jsonc/mod.ts';
import { ApiPromise, WsProvider } from '$polkadot-js/api/mod.ts';

const config = parse(await Deno.readTextFile('./src/config.jsonc'));

const { endPoints, connections, txs } = config;

const connArr = endPoints.reduce(
	(memo, ep) => memo.concat([...Array(connections).keys()].map(() => ep)),
	[],
);

const apiPromises = connArr.map((ep) => ApiPromise.create({ provider: new WsProvider(ep) }));
const apis = await Promise.allSettled(apiPromises);

// Issuing the same requests
apis.forEach((api) => {
	// NS> formuate a tx from a txt script to executable toward an endpoints.
	// NS> you can also time the txs when the result is included with tx receipts.
});

Deno.exit();
