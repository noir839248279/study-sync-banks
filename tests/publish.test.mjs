import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,readdir,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publish,unlist,attachmentURL,downloadAttachment,verifyReview } from '../scripts/publish.mjs';
import { BANK_LIMIT } from '../schema/bank.ts';
const q={id:'q1',course:'合成课程',chapter:'章节',type:'判断题',question:'合成测试内容',answer:'正确',options:[],note:'private'};
const submission={format:'study-sync-submission',version:1,title:'测试',description:'',author:'署名',license:'测试材料',questions:[q],events:['private']};
const issue={number:42,user:{login:'test-user'}};
test('publisher binds the attachment to the actual reviewed file',()=>{
  const bytes=Buffer.from('reviewed'); const digest=createHash('sha256').update(bytes).digest('hex');
  verifyReview(bytes,digest.toUpperCase());
  assert.throws(()=>verifyReview(Buffer.from('replaced'),digest));
  assert.throws(()=>verifyReview(bytes,''));
});
async function temp(t){const dir=await mkdtemp(path.join(os.tmpdir(),'community-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(path.join(dir,'catalog.json'),JSON.stringify({format:'study-sync-catalog',version:1,updatedAt:'2026-10-09T00:00:00Z',banks:[]}));return dir;}
test('review snapshots are sanitized, immutable, versioned, and can be unlisted',async t=>{
  const root=await temp(t),first=await publish(root,submission,issue);
  const bytes=await readFile(path.join(root,first.path));
  assert.equal(bytes.length,first.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),first.sha256);
  assert.equal(bytes.toString().includes('private'),false);assert.equal(first.githubUser,'test-user');
  const next=await publish(root,{...submission,questions:[{...q,answer:'错误'}]},issue);assert.equal(next.version,2);
  assert.deepEqual(await readFile(path.join(root,first.path)),bytes);
  await unlist(root,42);assert.equal(JSON.parse(await readFile(path.join(root,'catalog.json'))).banks.length,0);
  const third=await publish(root,submission,issue);assert.equal(third.version,3);
});
test('bad submissions never modify catalog or create bank files',async t=>{
  const root=await temp(t),before=await readFile(path.join(root,'catalog.json'));
  for(const raw of [{...submission,format:'study-sync'},{...submission,questions:[q,q]},{...submission,questions:[{...q,question:'x'.repeat(20001)}]}]) await assert.rejects(publish(root,raw,issue));
  await assert.rejects(publish(root,submission,{...issue,pull_request:{}}));
  await assert.rejects(publish(root,submission,{...issue,user:{login:'evil/../../path'}}));
  assert.deepEqual(await readFile(path.join(root,'catalog.json')),before);assert.deepEqual(await readdir(root),['catalog.json']);
});
test('only one GitHub JSON attachment is accepted',()=>{
  const url='https://github.com/user-attachments/files/123/bank.json';
  assert.equal(attachmentURL(`[bank](${url})`),url);
  for(const body of ['https://evil.test/bank.json',url+'?token=abc',url+'\nhttps://github.com/user-attachments/files/124/other.json','https://github.com/user-attachments/files/123/../../bank.json']) assert.throws(()=>attachmentURL(body));
});
test('attachment fetch never sends credentials; external redirect and oversized streams fail',async()=>{
  const url='https://github.com/user-attachments/files/123/bank.json';let called=0;
  const data=await downloadAttachment(url,async(u,options)=>{called++;assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);return called===1?new Response(null,{status:302,headers:{location:'https://objects.githubusercontent.com/test'}}):new Response('{}');});
  assert.equal(data.toString(),'{}');assert.equal(called,2);
  await assert.rejects(downloadAttachment(url,async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})),/域名/);
  await assert.rejects(downloadAttachment(url,async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(BANK_LIMIT));c.enqueue(new Uint8Array(1));c.close();}}))),/25 MiB/);
});
