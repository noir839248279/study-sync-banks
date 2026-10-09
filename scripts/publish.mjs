import { readFile, writeFile, rename, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BANK_LIMIT, CATALOG_LIMIT, validateSubmission, validateCatalog } from '../schema/bank.ts';

export const REPO = 'noir839248279/study-sync-banks';
export function verifyReview(bytes, expected) {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected) || createHash('sha256').update(bytes).digest('hex') !== expected.toLowerCase()) throw Error('附件与审核文件的 SHA-256 不一致，请重新审核');
}
export function attachmentURL(body) {
  const matches = [...String(body).matchAll(/https:\/\/github\.com\/user-attachments\/files\/[^\s)<>"']+/g)].map(m => m[0]);
  const urls = [...new Set(matches.filter(s => /\.json$/i.test(s)))];
  if (urls.length !== 1) throw Error('投稿必须包含一个 GitHub JSON 附件链接');
  const url = new URL(urls[0]);
  if (url.host !== 'github.com' || url.username || url.password || url.search || url.hash || !/^\/user-attachments\/files\/[0-9]+\/[^/]+\.json$/i.test(url.pathname)) throw Error('附件链接不受支持');
  return url.href;
}
export async function downloadAttachment(url, fetcher = fetch) {
  // Attachment requests never carry GH_TOKEN, including through redirects.
  const initial = attachmentURL(url);
  let current = new URL(initial);
  const signal = AbortSignal.timeout(60000);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetcher(current.href, { redirect: 'manual', credentials: 'omit', signal });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw Error('附件重定向无效');
      const next = new URL(location, current);
      if (next.protocol !== 'https:' || next.username || next.password || next.port || !(next.hostname === 'github.com' || next.hostname.endsWith('.githubusercontent.com'))) throw Error('附件重定向域名不受支持');
      await response.body?.cancel();
      current = next; continue;
    }
    if (!response.ok || !response.body) throw Error(`附件下载失败 (${response.status})`);
    if (Number(response.headers.get('content-length')) > BANK_LIMIT) throw Error('附件超过 25 MiB');
    let size = 0; const chunks = []; const reader = response.body.getReader();
    try {
      for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > BANK_LIMIT) throw Error('附件超过 25 MiB'); chunks.push(value); }
    } catch (e) { await reader.cancel().catch(()=>{}); throw e; }
    return Buffer.concat(chunks, size);
  }
  throw Error('附件重定向次数过多');
}
export async function publish(root, raw, issue) {
  if (!Number.isSafeInteger(issue.number) || issue.number < 1 || issue.pull_request || !issue.user?.login) throw Error('投稿 Issue 无效');
  const submission = validateSubmission(raw);
  const catalog = validateCatalog(JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8')));
  const id = `issue-${issue.number}`, bankDir = path.join(root,'banks',id);
  let previous = [];
  try { previous = await readdir(bankDir); } catch(e) { if (e.code !== 'ENOENT') throw e; }
  const version = Math.max(0, ...previous.filter(f=>/^[1-9][0-9]*\.json$/.test(f)).map(f=>Number(f.slice(0,-5)))) + 1;
  const bytes = Buffer.from(JSON.stringify(submission.questions,null,2)+'\n');
  const entry = { id,version,title:submission.title,description:submission.description,author:submission.author,githubUser:issue.user.login,license:submission.license,
    count:submission.questions.length,courses:[...new Set(submission.questions.map(q=>q.course))],types:[...new Set(submission.questions.map(q=>q.type))],
    path:`banks/${id}/${version}.json`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),issue:issue.number };
  const next = validateCatalog({...catalog,updatedAt:new Date().toISOString(),banks:[...catalog.banks.filter(b=>b.id!==id),entry]});
  const catalogBytes = JSON.stringify(next,null,2)+'\n';
  if (Buffer.byteLength(catalogBytes) > CATALOG_LIMIT) throw Error('目录超过 1 MiB');
  await mkdir(bankDir,{recursive:true});
  // Immutable reviewed snapshots. No attachment URL is left in the catalog.
  await writeFile(path.join(bankDir,`${version}.json`),bytes,{flag:'wx'});
  await writeFile(path.join(root,'catalog.json.tmp'),catalogBytes);
  await rename(path.join(root,'catalog.json.tmp'),path.join(root,'catalog.json'));
  return entry;
}
export async function unlist(root, number) {
  if (!Number.isSafeInteger(number) || number < 1) throw Error('Issue 编号无效');
  const catalog = validateCatalog(JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8')));
  const banks = catalog.banks.filter(b=>b.id!==`issue-${number}`);
  if (banks.length === catalog.banks.length) throw Error('这份题库不在目录中');
  await writeFile(path.join(root,'catalog.json.tmp'),JSON.stringify({...catalog,updatedAt:new Date().toISOString(),banks},null,2)+'\n');
  await rename(path.join(root,'catalog.json.tmp'),path.join(root,'catalog.json'));
}
async function main() {
  const number = Number(process.env.ISSUE_NUMBER), action = process.env.PUBLISH_ACTION;
  if (!Number.isSafeInteger(number) || number < 1 || !['publish','unlist'].includes(action)) throw Error('管理员操作参数无效');
  const root = fileURLToPath(new URL('../',import.meta.url));
  if (action === 'unlist') { await unlist(root,number); return; }
  const response = await fetch(`https://api.github.com/repos/${REPO}/issues/${number}`,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${process.env.GH_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28'}});
  if (!response.ok) throw Error(`无法读取投稿 Issue (${response.status})`);
  const issue = await response.json();
  if (issue.number !== number || issue.pull_request) throw Error('必须选择这个仓库中的普通 Issue');
  const bytes = await downloadAttachment(attachmentURL(issue.body));
  verifyReview(bytes, process.env.REVIEW_SHA256);
  const raw = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const bank = await publish(root,raw,issue);
  console.log(`Published ${bank.id} v${bank.version}: ${bank.count} questions`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e.message); process.exitCode=1; });
