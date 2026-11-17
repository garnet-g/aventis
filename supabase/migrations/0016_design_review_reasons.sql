-- Why the automatic check wanted a person to look at a design. Kept out of public.designs, which customers can read
-- (their own rows): telling them which word or score tripped the check would help them work around it.
-- Row level security with no policies: only the server (service role) reads or writes it.
create table public.design_review_reasons (
  design_id uuid primary key references public.designs (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.design_review_reasons enable row level security;
revoke all on public.design_review_reasons from anon, authenticated;

insert into public.design_review_reasons (design_id, reason)
  select id, review_reason from public.designs where review_reason is not null;
alter table public.designs drop column review_reason;
