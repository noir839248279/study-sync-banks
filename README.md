# 知序共享题库

这是知序 App 的公开题库目录，只保存分享题库和目录维护代码。软件源码仓库保持私有；这里没有软件签名密钥、更新令牌或个人学习记录。

## 下载

在知序 v1.4.0 及以上版本打开“本机题库 → 云端题库”，选择题库，下载并预览，再确认导入。下载后可以离线练习。读取公开目录不需要登录或填写令牌。

目录最初为空，不会自动公开用户的已有题库。

## 投稿

1. 在 App 的“云端题库 → 我要投稿”选一门课程，检查题目和答案，填写署名、来源及授权说明。
2. 生成投稿 JSON，保存文件，打开 GitHub 投稿页，用自己的 GitHub 账号登录并添加附件。
3. 等管理员审核。**Issue 与附件在提交时就已经公开，审核仅决定是否进入 App 下载列表。**

无需成为仓库协作者。普通读者可以投稿，但不能修改仓库代码或目录。不要上传个人学习备份。App 只导出题目字段；题干、答案及来源中人为写入的私人信息仍需自行检查。

## 管理员审核及上架

1. 打开投稿 Issue，下载附件，检查来源、授权、题目和答案。自动校验不能替代内容审核。
2. 在 Actions 选择 **Review and publish a bank → Run workflow**，分支选 `main`，输入审核过的 Issue 编号，action 选 `publish`。
3. 运行成功后刷新 App 目录。文件编号为 `issue-编号`。每次重新发布保存一个新版本，旧版本不覆盖。作者的 GitHub 用户名来自 Issue 作者，署名来自投稿表单。

只有仓库所有者可运行发布作业。发布作业只读取这个仓库的 Issue 中一个 GitHub JSON 附件，经过字段白名单和大小校验后写入快照。附件请求不携带仓库令牌。不执行附件内容、不检出投稿者代码、没有 `pull_request_target` 工作流。

修订题库请编辑原 Issue，移除旧附件链接并上传一个新 JSON，然后重新审核、发布。App 明确提示更新的题目数量，用户确认后才替换题干及答案；原有作答记录保留。请保留修订题目的原始编号，删除的题目不会自动删除用户本机数据。

下架：在同一工作流输入原 Issue 编号，action 选 `unlist`。这只移出下载列表，历史文件、Git 历史及他人下载的副本不会因此消失。公开错误资料应尽快处理，涉及敏感信息另按 GitHub 的移除流程处理。

## 数据约定

- `catalog.json`：目录 v1，最多 1 MiB、1000 份题库。
- `banks/issue-N/版本.json`：题目数组，最多 25 MiB、50000 道题，UTF-8 JSON。
- `schema/bank.ts`：与 App 共用的数据契约副本。调整时两边一起更新。
- 投稿文件使用 `study-sync-submission` v1；完整学习备份不被接受。
- 目录记录快照的 SHA-256、字节数、课程、题型、来源与授权。

安全边界：摘要用于检查下载与审核快照是否一致，不能判断答案是否正确，也不能防止仓库所有者账号被盗。反馈请使用 Issues 的“题库反馈”表单。

权限依据：[GitHub Issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue)、[附件](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)、[个人仓库权限](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository)。
