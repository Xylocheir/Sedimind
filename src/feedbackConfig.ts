/**
 * 问题反馈接收端点（开发者私有 Supabase 库）
 *
 * 由插件作者在源码里硬编码；终端用户无需配置。
 * 反馈内容（含可选邮箱）只发送到以下私有数据库，
 * 不会经过任何第三方表单服务或公开 Issue 系统。
 *
 * 安全说明：
 * - 使用 Legacy "anon" JWT key（以 `eyJ...` 开头），它是 Supabase 传统的公开客户端 key，
 *   可以安全地随插件发布，并受 RLS 策略约束，只能执行被授予的操作。
 * - 注意：新版 `sb_publishable_*` key 在 `/rest/v1/` 端点会返回 401（不被 PostgREST 网关接受），
 *   因此这里改用 legacy anon JWT。
 * - 配套 RLS 策略只授予 anon 角色 INSERT，禁止 SELECT / UPDATE / DELETE，
 *   因此即便 key 公开，攻击者也无法读取或篡改历史反馈。
 * - 终端用户的可选邮箱是"明文传输给开发者"，请勿填写真实密码；
 *   插件会在 UI 文案里提示"仅作回复用途"。
 *
 * 配套建表 SQL（开发者需在 Supabase SQL Editor 运行一次）：
 *
 *   create table if not exists public.feedbacks (
 *     id bigint generated always as identity primary key,
 *     type text,
 *     content text,
 *     email text,
 *     images text[],
 *     app_version text,
 *     lang text,
 *     created_at timestamptz default now()
 *   );
 *
 *   alter table public.feedbacks enable row level security;
 *
 *   create policy "anon insert feedback"
 *     on public.feedbacks
 *     for insert
 *     to anon
 *     with check (true);
 *
 *   -- 关键：RLS 策略只定义"策略"，还需在表级授予 anon 写入特权，否则 PostgREST 返回 401
 *   grant usage on schema public to anon;
 *   grant insert on table public.feedbacks to anon;
 *
 * 在 Supabase 后台查看反馈：
 *   Table Editor → public.feedbacks
 *   或 SQL Editor：select * from public.feedbacks order by created_at desc;
 */

export const FEEDBACK_SUPABASE_URL = "https://bacjyvhcmybztrjwujug.supabase.co";
export const FEEDBACK_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhY2p5dmhjbXlienRyand1anVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNTg0MDYsImV4cCI6MjEwMDczNDQwNn0.dCGobK8CnwqjfMn92u_Kn5Uh2fo52ggfoHGjuP_zRLA";
export const FEEDBACK_TABLE = "feedbacks";
