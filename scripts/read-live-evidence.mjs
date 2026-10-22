import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import fs from 'node:fs/promises';

// Public, read-only evidence collection. No account, private key or transaction.
const reader = createClient({ chain: studionet });
const address = '0x3B821AaD4Fc693f5518f74E2DD0eB9deC3A4B394';
const hash = process.argv[2] || '0x2c0b528cddca80c64af46c79a41ace631558c0e97b1ffc2277f7e716f258b58c';
const label = process.argv[3] || 'changed';
if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !/^[a-z][a-z0-9-]{0,40}$/.test(label)) {
  throw new Error('Use a transaction hash and a short lowercase output label');
}
const receipt = await reader.getTransaction({ hash });
const summary = {
  hash: receipt.hash, address, status: receipt.statusName,
  result: receipt.result_name,
  execution: (receipt.consensus_data?.leader_receipt || []).map(row => ({
    mode: row.mode, execution_result: row.execution_result,
    result: row.result, stderr: row.genvm_result?.stderr,
  })),
  created_at: receipt.created_at,
};
await fs.mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await fs.writeFile(new URL(`../evidence/${label}-receipt.json`, import.meta.url), JSON.stringify(summary, null, 2));
const notice = await reader.readContract({ address, functionName: 'get_notice', args: [1],
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
await fs.writeFile(new URL(`../evidence/${label}-state.json`, import.meta.url), JSON.stringify(notice, null, 2));
console.log(JSON.stringify({ receipt: summary, status: notice.last_status, revision: notice.revision,
  findings: notice.latest?.findings }, null, 2));
