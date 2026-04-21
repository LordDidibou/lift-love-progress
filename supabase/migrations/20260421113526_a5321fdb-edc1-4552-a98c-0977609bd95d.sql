
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "view own profile" on public.profiles for select using (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Exercises (built-in: user_id null; custom: user_id = auth user)
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text not null,
  equipment text not null,
  instructions text,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.exercises enable row level security;
create policy "view exercises (built-in or own)" on public.exercises for select
  using (user_id is null or auth.uid() = user_id);
create policy "insert own exercise" on public.exercises for insert
  with check (auth.uid() = user_id and is_custom = true);
create policy "update own exercise" on public.exercises for update using (auth.uid() = user_id);
create policy "delete own exercise" on public.exercises for delete using (auth.uid() = user_id);
create index on public.exercises (muscle_group);
create index on public.exercises (user_id);

-- Routines (templates)
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.routines enable row level security;
create policy "own routines all" on public.routines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position int not null default 0,
  target_sets int not null default 3,
  target_reps int not null default 10,
  notes text
);
alter table public.routine_exercises enable row level security;
create policy "routine_exercises own" on public.routine_exercises for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

-- Workouts (logged sessions)
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.workouts enable row level security;
create policy "own workouts all" on public.workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.workouts (user_id, started_at desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  set_number int not null,
  reps int not null default 0,
  weight numeric(6,2) not null default 0,
  rpe numeric(3,1),
  is_warmup boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.workout_sets enable row level security;
create policy "workout_sets own" on public.workout_sets for all
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create index on public.workout_sets (workout_id);
create index on public.workout_sets (exercise_id);

-- Body weight tracking
create table public.body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight numeric(5,2) not null,
  measured_at date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.body_weights enable row level security;
create policy "own body_weights" on public.body_weights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed built-in exercises (user_id null = global)
insert into public.exercises (user_id, name, muscle_group, equipment, is_custom) values
(null,'Bench Press','Pectoraux','Barre',false),
(null,'Incline Bench Press','Pectoraux','Barre',false),
(null,'Dumbbell Bench Press','Pectoraux','Haltères',false),
(null,'Incline Dumbbell Press','Pectoraux','Haltères',false),
(null,'Dips','Pectoraux','Poids du corps',false),
(null,'Cable Fly','Pectoraux','Poulie',false),
(null,'Push-up','Pectoraux','Poids du corps',false),
(null,'Squat','Jambes','Barre',false),
(null,'Front Squat','Jambes','Barre',false),
(null,'Leg Press','Jambes','Machine',false),
(null,'Leg Extension','Jambes','Machine',false),
(null,'Leg Curl','Jambes','Machine',false),
(null,'Romanian Deadlift','Jambes','Barre',false),
(null,'Lunge','Jambes','Haltères',false),
(null,'Bulgarian Split Squat','Jambes','Haltères',false),
(null,'Calf Raise','Jambes','Machine',false),
(null,'Hip Thrust','Jambes','Barre',false),
(null,'Deadlift','Dos','Barre',false),
(null,'Pull-up','Dos','Poids du corps',false),
(null,'Chin-up','Dos','Poids du corps',false),
(null,'Lat Pulldown','Dos','Poulie',false),
(null,'Barbell Row','Dos','Barre',false),
(null,'Dumbbell Row','Dos','Haltères',false),
(null,'Seated Cable Row','Dos','Poulie',false),
(null,'T-Bar Row','Dos','Barre',false),
(null,'Face Pull','Épaules','Poulie',false),
(null,'Overhead Press','Épaules','Barre',false),
(null,'Dumbbell Shoulder Press','Épaules','Haltères',false),
(null,'Lateral Raise','Épaules','Haltères',false),
(null,'Front Raise','Épaules','Haltères',false),
(null,'Rear Delt Fly','Épaules','Haltères',false),
(null,'Arnold Press','Épaules','Haltères',false),
(null,'Barbell Curl','Biceps','Barre',false),
(null,'Dumbbell Curl','Biceps','Haltères',false),
(null,'Hammer Curl','Biceps','Haltères',false),
(null,'Preacher Curl','Biceps','Barre',false),
(null,'Cable Curl','Biceps','Poulie',false),
(null,'Tricep Pushdown','Triceps','Poulie',false),
(null,'Skull Crusher','Triceps','Barre',false),
(null,'Overhead Tricep Extension','Triceps','Haltères',false),
(null,'Close-Grip Bench Press','Triceps','Barre',false),
(null,'Plank','Abdominaux','Poids du corps',false),
(null,'Crunch','Abdominaux','Poids du corps',false),
(null,'Hanging Leg Raise','Abdominaux','Poids du corps',false),
(null,'Cable Crunch','Abdominaux','Poulie',false),
(null,'Russian Twist','Abdominaux','Haltères',false),
(null,'Wrist Curl','Avant-bras','Haltères',false),
(null,'Farmer''s Walk','Avant-bras','Haltères',false);
