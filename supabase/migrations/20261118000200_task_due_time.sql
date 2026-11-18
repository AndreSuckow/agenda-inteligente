alter table public.tasks
  add column due_time time;

drop function if exists public.save_task(bigint, text, text, date, text, text, text, text[], text[]);

create or replace function public.save_task(
  p_task_id bigint,
  p_title text,
  p_description text,
  p_due_date date,
  p_due_time time,
  p_priority text,
  p_status text,
  p_recurrence text,
  p_subtask_titles text[],
  p_tags text[]
)
returns bigint
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_task_id bigint;
  v_next_task_id bigint;
  v_task public.tasks%rowtype;
  v_previous_status text := 'pending';
  v_old_subtasks jsonb := '[]'::jsonb;
  v_position integer;
  v_occurrence integer;
  v_subtask_title text;
  v_subtask_completed boolean;
  v_next_due_date date;
  v_create_next boolean := false;
  v_tags text[] := coalesce(p_tags, array[]::text[]);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if length(btrim(p_title)) not between 1 and 120 then
    raise exception 'Task title must contain between 1 and 120 characters';
  end if;
  if coalesce(cardinality(p_subtask_titles), 0) > 50 then
    raise exception 'A task can have no more than 50 subtasks';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_subtask_titles, array[]::text[])) as item(title)
    where length(btrim(item.title)) not between 1 and 120
  ) then
    raise exception 'Subtask titles must contain between 1 and 120 characters';
  end if;
  if cardinality(v_tags) > 10 then
    raise exception 'A task can have no more than 10 tags';
  end if;
  if exists (
    select 1
    from unnest(v_tags) as item(tag)
    where item.tag is null or length(btrim(item.tag)) not between 1 and 30
  ) then
    raise exception 'Task tags must contain between 1 and 30 characters';
  end if;
  if exists (
    select lower(btrim(item.tag))
    from unnest(v_tags) as item(tag)
    group by lower(btrim(item.tag))
    having count(*) > 1
  ) then
    raise exception 'Task tags must be unique';
  end if;
  if p_due_time is not null and p_due_date is null then
    raise exception 'A due time requires a due date';
  end if;

  if p_task_id is null then
    insert into public.tasks (
      user_id, title, description, due_date, due_time, priority, status, recurrence, completed_at, tags
    ) values (
      v_user_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
      p_due_date, p_due_time, p_priority, p_status,
      p_recurrence, case when p_status = 'completed' then now() else null end, v_tags
    )
    returning id into v_task_id;
  else
    select * into v_task
    from public.tasks
    where id = p_task_id and deleted_at is null
    for update;
    if not found then
      return null;
    end if;

    v_task_id := v_task.id;
    v_tags := coalesce(p_tags, v_task.tags);
    v_previous_status := v_task.status;
    select coalesce(
      jsonb_agg(jsonb_build_object('title', title, 'completed', completed) order by position),
      '[]'::jsonb
    ) into v_old_subtasks
    from public.task_subtasks
    where task_id = v_task_id;

    update public.tasks
    set title = btrim(p_title),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        due_date = p_due_date,
        due_time = p_due_time,
        priority = p_priority,
        status = p_status,
        recurrence = p_recurrence,
        completed_at = case when p_status = 'completed' then now() else null end,
        tags = v_tags,
        updated_at = now()
    where id = v_task_id;

    v_create_next := v_previous_status = 'pending'
      and p_status = 'completed'
      and p_recurrence <> 'none'
      and p_due_date is not null;
  end if;

  delete from public.task_subtasks where task_id = v_task_id;

  for v_position in 1..coalesce(cardinality(p_subtask_titles), 0) loop
    v_subtask_title := btrim(p_subtask_titles[v_position]);
    select count(*) into v_occurrence
    from unnest(p_subtask_titles[1:v_position]) as item(title)
    where item.title = p_subtask_titles[v_position];

    v_subtask_completed := false;
    if p_status = 'completed' then
      v_subtask_completed := true;
    elsif not (v_previous_status = 'completed' and p_status = 'pending') then
      select (matched.value ->> 'completed')::boolean into v_subtask_completed
      from (
        select value,
          row_number() over (partition by value ->> 'title' order by ordinality) as occurrence
        from jsonb_array_elements(v_old_subtasks) with ordinality as old(value, ordinality)
      ) as matched
      where matched.value ->> 'title' = v_subtask_title
        and matched.occurrence = v_occurrence;
      v_subtask_completed := coalesce(v_subtask_completed, false);
    end if;

    insert into public.task_subtasks (user_id, task_id, title, position, completed)
    values (v_user_id, v_task_id, v_subtask_title, v_position - 1, v_subtask_completed);
  end loop;

  if v_create_next then
    v_next_due_date := case p_recurrence
      when 'daily' then p_due_date + 1
      when 'weekly' then p_due_date + 7
      when 'monthly' then (
        date_trunc('month', p_due_date + interval '1 month')::date
        + extract(day from p_due_date)::integer - 1
      )
      else null
    end;
    insert into public.tasks (user_id, title, description, due_date, due_time, priority, recurrence, tags)
    values (v_user_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
      v_next_due_date, p_due_time, p_priority, p_recurrence, v_tags)
    returning id into v_next_task_id;

    insert into public.task_subtasks (user_id, task_id, title, position)
    select v_user_id, v_next_task_id, title, position
    from public.task_subtasks
    where task_id = v_task_id
    order by position;
  end if;

  return v_task_id;
end;
$$;

create or replace function public.toggle_task_subtask(
  p_task_id bigint,
  p_position integer,
  p_completed boolean
)
returns bigint
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_task_id bigint;
  v_next_status text;
  v_all_completed boolean;
  v_next_due_date date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id and deleted_at is null
  for update;
  if not found then
    return null;
  end if;

  update public.task_subtasks
  set completed = p_completed, updated_at = now()
  where task_id = p_task_id and position = p_position
  returning task_id into v_task_id;
  if not found then
    return null;
  end if;

  select bool_and(completed) into v_all_completed
  from public.task_subtasks
  where task_id = p_task_id;
  v_next_status := case when coalesce(v_all_completed, false) then 'completed' else 'pending' end;

  if v_task.status <> v_next_status then
    update public.tasks
    set status = v_next_status,
        completed_at = case when v_next_status = 'completed' then now() else null end,
        updated_at = now()
    where id = p_task_id;

    if v_task.status = 'pending'
      and v_next_status = 'completed'
      and v_task.recurrence <> 'none'
      and v_task.due_date is not null
    then
      v_next_due_date := case v_task.recurrence
        when 'daily' then v_task.due_date + 1
        when 'weekly' then v_task.due_date + 7
        when 'monthly' then (
          date_trunc('month', v_task.due_date + interval '1 month')::date
          + extract(day from v_task.due_date)::integer - 1
        )
        else null
      end;
      insert into public.tasks (user_id, title, description, due_date, due_time, priority, recurrence, tags)
      values (v_user_id, v_task.title, v_task.description, v_next_due_date, v_task.due_time,
        v_task.priority, v_task.recurrence, v_task.tags)
      returning id into v_task_id;

      insert into public.task_subtasks (user_id, task_id, title, position)
      select v_user_id, v_task_id, title, position
      from public.task_subtasks
      where task_id = p_task_id
      order by position;
    end if;
  end if;

  return p_task_id;
end;
$$;

revoke all on function public.save_task(bigint, text, text, date, time, text, text, text, text[], text[]) from public, anon;
revoke all on function public.toggle_task_subtask(bigint, integer, boolean) from public, anon;
grant execute on function public.save_task(bigint, text, text, date, time, text, text, text, text[], text[]) to authenticated;
grant execute on function public.toggle_task_subtask(bigint, integer, boolean) to authenticated;
