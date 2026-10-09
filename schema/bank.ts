// Shared data contract; a copy is published in the separate community repository.
export const BANK_LIMIT = 25 * 1024 * 1024;
export const CATALOG_LIMIT = 1024 * 1024;
export const BANK_TYPES = ["单选题", "多选题", "判断题", "填空题", "综合题"];
export interface SharedQuestion {
  id: string; course: string; chapter: string; type: string; question: string;
  options: { key: string; text: string }[]; answer: string; source?: string; number?: number;
}
export interface Submission {
  format: "study-sync-submission"; version: 1; title: string; description: string;
  author: string; license: string; questions: SharedQuestion[];
}
export interface CloudBank {
  id: string; version: number; title: string; description: string; author: string;
  githubUser: string; license: string; count: number; courses: string[]; types: string[];
  path: string; bytes: number; sha256: string; issue: number;
}
export interface Catalog {
  format: "study-sync-catalog"; version: 1; updatedAt: string; banks: CloudBank[];
}
export function textField(value: unknown, max: number, label: string, optional = false): string {
  if (optional && (value === undefined || (typeof value === "string" && !value.trim()))) return "";
  if (typeof value !== "string" || value.length > max || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw Error(`${label}为空、过长或含无效字符`);
  return value.trim();
}
export function cleanQuestions(raw: unknown): SharedQuestion[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50000) throw Error("题库须包含 1 至 50000 道题");
  const ids = new Set<string>();
  return raw.map((q: any) => {
    if (!q || typeof q !== "object" || Array.isArray(q)) throw Error("题目格式不正确");
    const id = textField(q.id, 128, "题目编号");
    if (ids.has(id)) throw Error("题库存在重复题目编号：" + id);
    ids.add(id);
    if (!BANK_TYPES.includes(q.type)) throw Error("题型不支持");
    if (!Array.isArray(q.options) || q.options.length > 26) throw Error("题目选项格式不正确");
    const keys = new Set<string>();
    const options = q.options.map((o: any) => {
      if (!o || typeof o !== "object") throw Error("题目选项格式不正确");
      const key = textField(o.key, 8, "选项编号");
      if (keys.has(key)) throw Error("题目包含重复选项编号");
      keys.add(key);
      return { key, text: textField(o.text, 10000, "选项内容") };
    });
    // Reconstruct the whitelist; never export user records or extra object fields.
    const result: SharedQuestion = { id, course: textField(q.course, 80, "课程"), chapter: textField(q.chapter, 120, "章节"), type: q.type,
      question: textField(q.question, 20000, "题干"), options, answer: textField(q.answer, 10000, "正确答案") };
    if (q.source !== undefined && q.source !== "") result.source = textField(q.source, 1000, "题目来源");
    if (q.number !== undefined) {
      if (!Number.isSafeInteger(q.number) || q.number < 0 || q.number > 1000000) throw Error("题目序号不正确");
      result.number = q.number;
    }
    return result;
  });
}
export function makeSubmission(raw: any, questions: unknown): Submission {
  return { format: "study-sync-submission", version: 1, title: textField(raw?.title, 100, "题库名称"),
    description: textField(raw?.description, 2000, "题库说明", true), author: textField(raw?.author, 80, "作者"),
    license: textField(raw?.license, 2000, "来源与授权说明"), questions: cleanQuestions(questions) };
}
export function validateSubmission(raw: any): Submission {
  if (raw?.format !== "study-sync-submission" || raw?.version !== 1) throw Error("请选择知序投稿文件，不能提交学习备份");
  return makeSubmission(raw, raw.questions);
}
export function validateCatalog(raw: any): Catalog {
  if (raw?.format !== "study-sync-catalog" || raw?.version !== 1 || !Array.isArray(raw.banks) || raw.banks.length > 1000
    || typeof raw.updatedAt !== "string" || !Number.isFinite(Date.parse(raw.updatedAt))) throw Error("云端题库目录格式不正确");
  const ids = new Set<string>();
  const banks = raw.banks.map((b: any): CloudBank => {
    if (!b || typeof b.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(b.id) || ids.has(b.id)) throw Error("云端题库编号无效或重复");
    ids.add(b.id);
    if (!Number.isSafeInteger(b.version) || b.version < 1 || !Number.isSafeInteger(b.count) || b.count < 1 || b.count > 50000
      || !Number.isSafeInteger(b.bytes) || b.bytes < 1 || b.bytes > BANK_LIMIT || !Number.isSafeInteger(b.issue) || b.issue < 1
      || typeof b.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(b.sha256) || b.path !== `banks/${b.id}/${b.version}.json`
      || typeof b.githubUser !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(b.githubUser)) throw Error("云端题库下载信息不正确");
    if (!Array.isArray(b.courses) || !b.courses.length || b.courses.length > 100 || !Array.isArray(b.types) || !b.types.length || b.types.length > 5
      || b.types.some((t: unknown) => typeof t !== "string" || !BANK_TYPES.includes(t)) || new Set(b.types).size !== b.types.length) throw Error("云端题库课程或题型信息不正确");
    const courses = b.courses.map((c: unknown) => textField(c, 80, "课程"));
    if (new Set(courses).size !== courses.length) throw Error("云端题库课程重复");
    return { id: b.id, version: b.version, title: textField(b.title, 100, "题库名称"), description: textField(b.description, 2000, "题库说明", true),
      author: textField(b.author, 80, "作者"), githubUser: b.githubUser, license: textField(b.license, 2000, "来源与授权说明"),
      count: b.count, courses, types: [...b.types], path: b.path, bytes: b.bytes, sha256: b.sha256, issue: b.issue };
  });
  return { format: "study-sync-catalog", version: 1, updatedAt: raw.updatedAt, banks };
}
export function checkBankSummary(bank: CloudBank, questions: SharedQuestion[]) {
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
  if (bank.count !== questions.length || !same(bank.courses, [...new Set(questions.map(q => q.course))])
    || !same(bank.types, [...new Set(questions.map(q => q.type))])) throw Error("下载题库与目录信息不一致，请刷新后重试");
}
