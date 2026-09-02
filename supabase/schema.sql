-- =============================================================
-- نظام بيان لإدارة المهام — بنية قاعدة البيانات
-- -------------------------------------------------------------
-- شغّل هذا الملف مرة واحدة في:  Supabase ← SQL Editor ← New query
-- ثم شغّل بعده ملف seed.sql
--
-- ملاحظة أمنية جوهرية: الحماية الحقيقية هنا، لا في المتصفح.
-- سياسات RLS أدناه تمنع أي موظف من قراءة أو تعديل صف لا يخصّه
-- حتى لو تلاعب بشيفرة الصفحة.
-- =============================================================

-- ---------- 1. الإعدادات العامة ----------
create extension if not exists "uuid-ossp";

-- توقيت الجمعية — تُحتسب عليه أيام العمل وساعة القطع
create or replace function public.org_tz() returns text
language sql immutable as $$ select 'Asia/Riyadh' $$;

-- ---------- 2. الجداول ----------

create table if not exists public.departments (
  id          text primary key,
  name        text not null,
  icon        text default '▪️',
  descr       text default '',
  sort_order  int  not null default 99
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text not null default '',
  role          text not null default 'employee' check (role in ('owner','manager','employee')),
  department_id text references public.departments(id),
  job_title     text default '',
  active        boolean not null default false,   -- يبدأ معطَّلاً حتى يفعّله المالك
  created_at    timestamptz not null default now()
);

create table if not exists public.services (
  id            uuid primary key default uuid_generate_v4(),
  department_id text not null references public.departments(id),
  name          text not null,
  sla_days      int  not null default 5 check (sla_days between 1 and 90),
  audience      text[] not null default '{}',
  channel       text default '',
  reqs          text[] not null default '{}',
  flow          text[] not null default '{}',
  note          text default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.holidays (
  date  date primary key,
  name  text not null
);

create sequence if not exists public.task_ref_seq;

create table if not exists public.tasks (
  id             uuid primary key default uuid_generate_v4(),
  ref_no         text unique,
  service_id     uuid references public.services(id),
  title          text not null,
  description    text default '',
  priority       text not null default 'normal' check (priority in ('normal','urgent')),

  requester_id   uuid not null references public.profiles(id),
  requester_dept text references public.departments(id),
  department_id  text not null references public.departments(id),  -- الإدارة المنفِّذة
  assignee_id    uuid references public.profiles(id),

  status         text not null default 'submitted' check (status in (
                   'submitted','screening','returned','accepted','assigned',
                   'in_progress','pending_approval','completed','closed',
                   'rejected','cancelled')),
  sla_days       int not null default 5,

  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,      -- لحظة بدء احتساب المدة
  due_at         timestamptz,      -- تاريخ الاستحقاق المثبَّت
  completed_at   timestamptz,
  closed_at      timestamptz,

  return_reason  text,
  satisfaction   smallint check (satisfaction between 1 and 5)
);

create index if not exists tasks_dept_idx     on public.tasks(department_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_requester_idx on public.tasks(requester_id);
create index if not exists tasks_status_idx   on public.tasks(status);
create index if not exists tasks_due_idx      on public.tasks(due_at);

create table if not exists public.task_events (
  id          uuid primary key default uuid_generate_v4(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.profiles(id),
  from_status text,
  to_status   text not null,
  note        text default '',
  created_at  timestamptz not null default now()
);
create index if not exists events_task_idx on public.task_events(task_id, created_at);

create table if not exists public.task_files (
  id           uuid primary key default uuid_generate_v4(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  file_name    text not null,
  storage_path text not null,
  uploaded_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists files_task_idx on public.task_files(task_id);


-- ---------- 3. احتساب أيام العمل ----------
-- أيام العمل: الأحد (0) إلى الخميس (4) بتوقيت الرياض، عدا العطل المسجّلة.

create or replace function public.is_working_day(p_date date)
returns boolean language sql stable as $$
  select extract(dow from p_date)::int between 0 and 4
     and not exists (select 1 from public.holidays h where h.date = p_date)
$$;

-- تاريخ الاستحقاق = نهاية دوام يوم العمل رقم n بعد لحظة البدء الفعلية.
-- قاعدة القطع: الطلب المقبول بعد الساعة 2 ظهراً يُحتسب من يوم العمل التالي.
create or replace function public.add_working_days(p_from timestamptz, p_days int)
returns timestamptz language plpgsql stable as $$
declare
  d     date;
  h     int;
  remain int := greatest(1, coalesce(p_days, 5));
begin
  d := (timezone(public.org_tz(), p_from))::date;
  h := extract(hour from timezone(public.org_tz(), p_from))::int;

  if not public.is_working_day(d) or h >= 14 then
    loop
      d := d + 1;
      exit when public.is_working_day(d);
    end loop;
  end if;

  remain := remain - 1;                    -- يوم البدء يُحتسب أول أيام المدة
  while remain > 0 loop
    d := d + 1;
    if public.is_working_day(d) then remain := remain - 1; end if;
  end loop;

  return timezone(public.org_tz(), (d + time '16:00'));  -- نهاية الدوام
end $$;

-- عدد أيام العمل بين تاريخين (موجب إذا كان الثاني بعد الأول)
create or replace function public.working_days_between(a timestamptz, b timestamptz)
returns int language sql stable as $$
  select coalesce((
    select count(*)::int * (case when b >= a then 1 else -1 end)
    from generate_series(
           (timezone(public.org_tz(), least(a,b)))::date + 1,
           (timezone(public.org_tz(), greatest(a,b)))::date,
           interval '1 day') g(day)
    where public.is_working_day(g.day::date)
  ), 0)
$$;

-- المدة الفعلية بعد الاستعجال (نصف المدة، تُقرَّب لأعلى)
create or replace function public.effective_days(p_days int, p_priority text)
returns int language sql immutable as $$
  select greatest(1, case when p_priority = 'urgent'
                          then ceil(coalesce(p_days,5) / 2.0)::int
                          else coalesce(p_days,5) end)
$$;


-- ---------- 4. دوال الهوية والصلاحية ----------
-- SECURITY DEFINER لتفادي التكرار اللانهائي في سياسات profiles.

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_dept() returns text
language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_owner() returns boolean
language sql stable as $$ select public.my_role() = 'owner' $$;


-- ---------- 5. توليد رقم المتابعة وتسجيل الأحداث ----------

create or replace function public.tasks_before_insert()
returns trigger language plpgsql as $$
begin
  if new.ref_no is null then
    new.ref_no := 'BN-' || to_char(timezone(public.org_tz(), now()), 'YYYY')
                  || '-' || lpad(nextval('public.task_ref_seq')::text, 4, '0');
  end if;
  new.status := 'submitted';          -- كل طلب يبدأ من مسار الطلب
  new.accepted_at := null;
  new.due_at := null;
  return new;
end $$;

drop trigger if exists trg_tasks_before_insert on public.tasks;
create trigger trg_tasks_before_insert before insert on public.tasks
  for each row execute function public.tasks_before_insert();

create or replace function public.tasks_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_events(task_id, actor_id, from_status, to_status, note)
  values (new.id, new.requester_id, null, 'submitted', coalesce(new.description, 'رفع الطلب'));
  return new;
end $$;

drop trigger if exists trg_tasks_after_insert on public.tasks;
create trigger trg_tasks_after_insert after insert on public.tasks
  for each row execute function public.tasks_after_insert();

-- إنشاء ملف شخصي معطَّل تلقائياً عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          'employee', false)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------- 6. محرّك الإجراءات (مسار الطلب ومسار التنفيذ) ----------
-- كل تغيير في حالة المهمة يمر من هنا حصراً: لا توجد سياسة UPDATE على
-- جدول tasks، فلا يستطيع أحد تعديل حالة أو تاريخ استحقاق يدوياً.

create or replace function public.task_action(
  p_task         uuid,
  p_action       text,
  p_note         text default null,
  p_reason       text default null,
  p_assignee     uuid default null,
  p_satisfaction int  default null
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare
  t        public.tasks;
  me       public.profiles;
  new_st   text;
  ok       boolean := false;
  note     text;
  a_name   text;
begin
  select * into me from public.profiles where id = auth.uid() and active;
  if me is null then raise exception 'الحساب غير مفعَّل أو غير مسجَّل الدخول.'; end if;

  select * into t from public.tasks where id = p_task;
  if t is null then raise exception 'المهمة غير موجودة.'; end if;

  -- ---- الانتقال المسموح لكل إجراء ----
  new_st := case p_action
    when 'screen'      then 'screening'
    when 'return'      then 'returned'
    when 'resubmit'    then 'submitted'
    when 'accept'      then 'accepted'
    when 'reject'      then 'rejected'
    when 'assign'      then 'assigned'
    when 'start'       then 'in_progress'
    when 'submit_work' then 'pending_approval'
    when 'changes'     then 'in_progress'
    when 'approve'     then 'completed'
    when 'close'       then 'closed'
    when 'cancel'      then 'cancelled'
    else null end;
  if new_st is null then raise exception 'إجراء غير معروف: %', p_action; end if;

  -- ---- الحالة الحالية يجب أن تسمح بالإجراء ----
  if not (
    (p_action = 'screen'      and t.status = 'submitted') or
    (p_action = 'return'      and t.status in ('submitted','screening')) or
    (p_action = 'resubmit'    and t.status = 'returned') or
    (p_action = 'accept'      and t.status in ('submitted','screening')) or
    (p_action = 'reject'      and t.status in ('submitted','screening')) or
    (p_action = 'assign'      and t.status in ('accepted','assigned','in_progress')) or
    (p_action = 'start'       and t.status = 'assigned') or
    (p_action = 'submit_work' and t.status = 'in_progress') or
    (p_action = 'changes'     and t.status = 'pending_approval') or
    (p_action = 'approve'     and t.status = 'pending_approval') or
    (p_action = 'close'       and t.status = 'completed') or
    (p_action = 'cancel'      and t.status in ('submitted','screening','returned'))
  ) then
    raise exception 'لا يمكن تنفيذ «%» والمهمة في حالة «%».', p_action, t.status;
  end if;

  -- ---- من يملك الإجراء ----
  if me.role = 'owner' then
    ok := true;
  elsif p_action in ('screen','return','accept','reject','assign','changes','approve') then
    ok := (me.role = 'manager' and me.department_id = t.department_id);
  elsif p_action in ('start','submit_work') then
    ok := (t.assignee_id = me.id)
       or (me.role = 'manager' and me.department_id = t.department_id);
  elsif p_action in ('resubmit','close','cancel') then
    ok := (t.requester_id = me.id)
       or (me.role = 'manager' and me.department_id = t.requester_dept);
  end if;
  if not ok then raise exception 'لا تملك صلاحية هذا الإجراء.'; end if;

  -- ---- المدخلات الإلزامية ----
  if p_action in ('return','reject','cancel') and coalesce(length(trim(p_reason)),0) < 5 then
    raise exception 'يجب بيان السبب.';
  end if;
  if p_action = 'assign' and p_assignee is null then
    raise exception 'اختر المنفّذ المكلَّف.';
  end if;
  if p_action = 'close' and (p_satisfaction is null or p_satisfaction not between 1 and 5) then
    raise exception 'اختر تقييم الخدمة من 1 إلى 5.';
  end if;

  note := coalesce(nullif(trim(p_note),''), nullif(trim(p_reason),''), '');

  -- ---- تنفيذ الأثر ----
  if p_action = 'accept' then
    -- هنا فقط تبدأ المدة، ويُثبَّت تاريخ الاستحقاق فلا يتغيّر بعدها
    t.accepted_at := now();
    t.due_at := public.add_working_days(now(), t.sla_days);
    note := coalesce(nullif(note,''), 'الطلب مكتمل المتطلبات — بدأ احتساب المدة.');

  elsif p_action = 'return' then
    -- يبقى السبب محفوظاً بعد الاستكمال، ليُحتسب مؤشر «الطلبات المعادة
    -- لنقص البيانات» على تاريخ الطلب لا على حالته اللحظية
    t.return_reason := p_reason;
    note := p_reason;

  elsif p_action = 'assign' then
    select full_name into a_name from public.profiles
      where id = p_assignee and active and department_id = t.department_id;
    if a_name is null then
      raise exception 'المنفّذ غير موجود أو ليس من هذه الإدارة.';
    end if;
    t.assignee_id := p_assignee;
    note := 'إسناد المهمة إلى ' || a_name || case when note <> '' then ' — ' || note else '' end;

  elsif p_action = 'approve' then
    t.completed_at := now();
    note := coalesce(nullif(note,''), 'اعتماد الإنجاز.');

  elsif p_action = 'close' then
    t.closed_at := now();
    t.satisfaction := p_satisfaction;
    note := 'تم الاستلام — التقييم: ' || p_satisfaction || '/5'
            || case when note <> '' then ' — ' || note else '' end;

  elsif p_action in ('reject','cancel') then
    note := p_reason;
  end if;

  insert into public.task_events(task_id, actor_id, from_status, to_status, note)
  values (t.id, me.id, t.status, new_st, note);

  update public.tasks set
    status = new_st, accepted_at = t.accepted_at, due_at = t.due_at,
    completed_at = t.completed_at, closed_at = t.closed_at,
    assignee_id = t.assignee_id, return_reason = t.return_reason,
    satisfaction = t.satisfaction
  where id = t.id
  returning * into t;

  return t;
end $$;


-- ---------- 7. مؤشرات جاهزة ----------

create or replace view public.v_task_status as
select t.*,
  (t.accepted_at is null)                                   as not_started,
  case
    when t.status in ('rejected','cancelled') or t.accepted_at is null then null
    when t.status in ('completed','closed')
      then coalesce(t.completed_at, t.closed_at) > t.due_at
    else now() > t.due_at
  end as is_late
from public.tasks t;

create or replace view public.v_department_kpi as
select d.id as department_id, d.name,
  count(*) filter (where v.status not in ('rejected','cancelled'))            as total,
  count(*) filter (where v.status in ('completed','closed'))                  as done,
  count(*) filter (where v.is_late and v.status not in ('completed','closed')) as late_open,
  round(100.0 * count(*) filter (where v.is_late is false and v.status in ('completed','closed'))
        / nullif(count(*) filter (where v.is_late is not null
                 and (v.status in ('completed','closed') or v.is_late)), 0), 1) as commitment_pct
from public.departments d
left join public.v_task_status v on v.department_id = d.id
group by d.id, d.name order by d.sort_order;

create or replace view public.v_employee_kpi as
select p.id as user_id, p.full_name, p.department_id,
  count(v.id) filter (where v.status not in ('rejected','cancelled'))          as total,
  count(v.id) filter (where v.status in ('completed','closed'))                as done,
  count(v.id) filter (where v.is_late and v.status not in ('completed','closed')) as late_open,
  round(100.0 * count(v.id) filter (where v.is_late is false and v.status in ('completed','closed'))
        / nullif(count(v.id) filter (where v.is_late is not null
                 and (v.status in ('completed','closed') or v.is_late)), 0), 1) as commitment_pct
from public.profiles p
left join public.v_task_status v on v.assignee_id = p.id
group by p.id, p.full_name, p.department_id;


-- ---------- 8. سياسات RLS ----------

alter table public.departments enable row level security;
alter table public.profiles    enable row level security;
alter table public.services    enable row level security;
alter table public.holidays    enable row level security;
alter table public.tasks       enable row level security;
alter table public.task_events enable row level security;
alter table public.task_files  enable row level security;

-- الجداول المرجعية: قراءة للجميع، كتابة للمالك
drop policy if exists dep_read on public.departments;
create policy dep_read on public.departments for select to authenticated using (true);
drop policy if exists dep_write on public.departments;
create policy dep_write on public.departments for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists svc_read on public.services;
create policy svc_read on public.services for select to authenticated using (true);
drop policy if exists svc_write on public.services;
create policy svc_write on public.services for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists hol_read on public.holidays;
create policy hol_read on public.holidays for select to authenticated using (true);
drop policy if exists hol_write on public.holidays;
create policy hol_write on public.holidays for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- الملفات الشخصية: الأسماء مقروءة للجميع (لعرض المُسنَد إليه)،
-- والتعديل للمالك وحده — فلا يرفّع أحد نفسه إلى مدير.
drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select to authenticated using (true);
drop policy if exists prof_write on public.profiles;
create policy prof_write on public.profiles for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- المهام: القراءة حسب الدور
drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select to authenticated using (
  public.my_role() = 'owner'
  or (public.my_role() = 'manager'
      and (department_id = public.my_dept() or requester_dept = public.my_dept()))
  or requester_id = auth.uid()
  or assignee_id  = auth.uid()
);

-- الإنشاء: باسم المستخدم نفسه فقط
drop policy if exists task_insert on public.tasks;
create policy task_insert on public.tasks for insert to authenticated
  with check (requester_id = auth.uid() and public.my_role() is not null);

-- لا توجد سياسة UPDATE أو DELETE عمداً:
-- كل تغيير للحالة يمر عبر public.task_action() التي تتحقق من الصلاحية وتكتب السجل.

-- سجل الأحداث: يُقرأ مع المهمة، ولا يُكتب ولا يُعدَّل يدوياً
drop policy if exists ev_read on public.task_events;
create policy ev_read on public.task_events for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id)
);

-- المرفقات: تتبع صلاحية المهمة الأم
drop policy if exists file_read on public.task_files;
create policy file_read on public.task_files for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id)
);
drop policy if exists file_insert on public.task_files;
create policy file_insert on public.task_files for insert to authenticated
  with check (uploaded_by = auth.uid()
              and exists (select 1 from public.tasks t where t.id = task_id));


-- ---------- 9. مخزن المرفقات ----------
insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', false)
on conflict (id) do nothing;

drop policy if exists tf_read on storage.objects;
create policy tf_read on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and exists (
    select 1 from public.tasks t
    where t.id::text = split_part(name, '/', 1)));

drop policy if exists tf_write on storage.objects;
create policy tf_write on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and exists (
    select 1 from public.tasks t
    where t.id::text = split_part(name, '/', 1)));


-- ---------- 10. الصلاحيات ----------
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert on public.tasks, public.task_files to authenticated;
grant update on public.profiles, public.services, public.departments, public.holidays to authenticated;
grant insert, delete on public.services, public.departments, public.holidays to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on sequence public.task_ref_seq to authenticated;
