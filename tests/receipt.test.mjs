import test from 'node:test';
import assert from 'node:assert/strict';
import { abi } from 'genlayer-js';
import { assertReceiptIdentity } from '../src/chain-guards.ts';
import { readFileSync } from 'node:fs';
const entry = {wallet:'0x1111111111111111111111111111111111111111',contract:'0x2222222222222222222222222222222222222222',action:'compare_notice',args:[1,'request_123'],hash:'0x'+'a'.repeat(64)};
function receipt(args=entry.args){return {hash:entry.hash,from_address:entry.wallet,to_address:entry.contract,data:{calldata:{raw:Array.from(abi.calldata.encode(abi.calldata.makeCalldataObject(entry.action,args)))}}};}
test('recovery decodes binary calldata and matches the original transaction',()=>{
  assert.doesNotThrow(()=>assertReceiptIdentity(receipt(),entry));
  assert.throws(()=>assertReceiptIdentity({...receipt(),from_address:entry.contract},entry));
  assert.throws(()=>assertReceiptIdentity({...receipt(),to_address:entry.wallet},entry));
  assert.throws(()=>assertReceiptIdentity({...receipt(),data:{calldata:{raw:Array.from(abi.calldata.encode(abi.calldata.makeCalldataObject('capture_baseline',entry.args)))}}},entry));
  assert.throws(()=>assertReceiptIdentity(receipt([1,'other_request']),entry));
  assert.throws(()=>assertReceiptIdentity({...receipt(),data:{calldata:{readable:'{"method":"compare_notice"}'}}},entry));
});
test('actual Studio registration calldata binds the recorded source and request',()=>{
  const actual = JSON.parse(readFileSync(new URL('../evidence/register-receipt.json',import.meta.url),'utf8'));
  const expected={wallet:actual.sender,contract:actual.recipient,hash:actual.hash,action:'register_notice',args:[
    'notice_live_20261022_01',
    'https://raw.githubusercontent.com/q3579338/genlayer-notice-delta/main/fixtures/announcement.md',
    'Controlled workshop announcement',
    ['The closing date and time for applications to the example workshop']
  ]};
  assert.doesNotThrow(()=>assertReceiptIdentity(actual,expected));
  assert.throws(()=>assertReceiptIdentity(actual,{...expected,args:[...expected.args.slice(0,2),'different title',expected.args[3]]}));
});
