import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraft, filterNotices, exportBundle } from '../src/model.ts';
import { receiptOutcome, assertCanSend, mergeEntry, isUserRejection } from '../src/transactions.ts';
const valid = { title: '公开活动公告', sourceUrl: 'https://genlayer.foundation/notice', questions: ['提交截止时间是否发生变化？'] };
test('reject credential URLs, local endpoints and ambiguous empty concerns', () => {
  for (const sourceUrl of ['http://example.org', 'https://user:pass@example.org', 'https://localhost/x', 'https://127.0.0.1/x'])
    assert.throws(() => normalizeDraft({...valid, sourceUrl}));
  assert.throws(() => normalizeDraft({...valid, questions: ['截止']}));
  assert.throws(() => normalizeDraft({...valid, questions: [valid.questions[0], valid.questions[0]]}));
  assert.equal(normalizeDraft(valid).questions.length, 1);
});
test('accepted never becomes finalized and execution failure remains failure', () => {
  assert.equal(receiptOutcome({status: 5, txExecutionResult: 1}), 'accepted');
  assert.equal(receiptOutcome({status: 'FINALIZED', txExecutionResult: 1}), 'finalized');
  assert.equal(receiptOutcome({statusName: 'FINALIZED', txExecutionResult: 2}), 'failed');
  assert.throws(() => receiptOutcome({status: 7}));
  assert.equal(receiptOutcome({statusName:'FINALIZED',result:'MAJORITY_AGREE',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS',result:{status:'return'}},{mode:'validator',execution_result:'ERROR',result:{status:'error'}}]}}),'finalized');
  assert.equal(receiptOutcome({statusName:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'ERROR',result:{status:'error'}}]}}),'failed');
  assert.throws(() => receiptOutcome({statusName:'FINALIZED',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS'}]}}));
  assert.throws(() => receiptOutcome({statusName:'FINALIZED',result:'MAJORITY_DISAGREE',consensus_data:{leader_receipt:[{mode:'leader',execution_result:'SUCCESS',result:{status:'return'}}]}}));
});
test('interrupted transactions block resubmission across accounts', () => {
  const entry = {id:'a',contract:'0xA',wallet:'0x1',phase:'awaiting-wallet',createdAt:'2026-10-22'};
  assert.throws(() => assertCanSend([entry], '0xa'));
  assert.doesNotThrow(() => assertCanSend([{...entry,phase:'finalized'}], '0xa'));
  assert.equal(mergeEntry([entry], {...entry,hash:'0x1'}).length, 1);
});
test('example export explicitly discloses its non-chain origin', () => {
  const value = exportBundle([], 'offline-example', {});
  assert.equal(value.mode, 'offline-example');
  assert.match(value.notice, /虚构离线示例/);
  assert.deepEqual(filterNotices([], '', 'ALL'), []);
});
test('wallet rejection survives the SDK error wrapper without implying broadcast',()=>{
  assert.equal(isUserRejection({cause:{cause:{code:4001}}}),true);
  assert.equal(isUserRejection({cause:{name:'UserRejectedRequestError'}}),true);
  assert.equal(isUserRejection({message:'timeout'}),false);
});
