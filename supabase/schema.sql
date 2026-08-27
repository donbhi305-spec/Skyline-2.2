-- Skyline web migration: Firebase Realtime Database -> Supabase Postgres.
create extension if not exists pgcrypto;

create table if not exists profiles (
  uid text primary key, email text, username text, nickname text, biography text,
  gender text default 'hidden', avatar text, profile_cover_image text, avatar_history_type text,
  verify text default 'false', account_type text default 'user', account_premium text default 'false',
  banned text default 'false', user_level_xp text default '500', user_region text, status text,
  join_date text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists profiles_username_lower_idx on profiles(lower(username)) where username is not null;

create table if not exists posts (
  id text primary key, key text, uid text not null references profiles(uid) on delete cascade,
  post_text text, post_type text, post_image text, post_region text, post_visibility text,
  post_hide_views_count text, post_hide_like_count text, post_hide_comments_count text,
  post_disable_favorite text, post_disable_comments text, likes integer default 0, comments integer default 0,
  publish_date text
);
create index if not exists posts_uid_idx on posts(uid);
create index if not exists posts_publish_idx on posts(publish_date desc);

create table if not exists follows (
  follower_id text not null references profiles(uid) on delete cascade,
  following_id text not null references profiles(uid) on delete cascade,
  created_at timestamptz default now(), primary key(follower_id,following_id)
);
create index if not exists follows_following_idx on follows(following_id);

create table if not exists post_likes (post_id text not null references posts(id) on delete cascade,user_id text not null references profiles(uid) on delete cascade,created_at timestamptz default now(),primary key(post_id,user_id));
create table if not exists favorite_posts (post_id text not null references posts(id) on delete cascade,user_id text not null references profiles(uid) on delete cascade,created_at timestamptz default now(),primary key(post_id,user_id));
create table if not exists profile_likes (profile_id text not null references profiles(uid) on delete cascade,user_id text not null references profiles(uid) on delete cascade,created_at timestamptz default now(),primary key(profile_id,user_id));

create table if not exists line_videos (
  id text primary key,key text,uid text not null references profiles(uid) on delete cascade,post_type text,
  post_text text,video_uri text,post_region text,publish_date text
);
create index if not exists line_videos_publish_idx on line_videos(publish_date desc);

create table if not exists inbox (
  owner_id text not null references profiles(uid) on delete cascade,
  contact_id text not null references profiles(uid) on delete cascade,
  uid text, type text, last_message_uid text,last_message_text text,last_message_state text,push_date text,
  primary key(owner_id,contact_id)
);
create table if not exists messages (
  id text primary key default gen_random_uuid()::text,
  key text,
  sender_id text not null references profiles(uid) on delete cascade,
  recipient_id text not null references profiles(uid) on delete cascade,
  uid text,message_text text,message_state text,push_date text,type text,
  created_at timestamptz default now()
);
create index if not exists messages_pair_idx on messages(sender_id,recipient_id,push_date);

create table if not exists comments (id text primary key default gen_random_uuid()::text,post_id text not null references posts(id) on delete cascade,author_id text not null references profiles(uid) on delete cascade,uid text,comment_text text,created_at timestamptz default now());
create table if not exists comment_replies (id text primary key default gen_random_uuid()::text,comment_id text not null references comments(id) on delete cascade,author_id text not null references profiles(uid) on delete cascade,uid text,reply_text text,created_at timestamptz default now());
create table if not exists comment_likes (comment_id text not null references comments(id) on delete cascade,user_id text not null references profiles(uid) on delete cascade,primary key(comment_id,user_id));
create table if not exists comment_reply_likes (reply_id text not null references comment_replies(id) on delete cascade,user_id text not null references profiles(uid) on delete cascade,primary key(reply_id,user_id));
create table if not exists post_shares (id text primary key default gen_random_uuid()::text,post_id text references posts(id) on delete cascade,user_id text references profiles(uid) on delete cascade,created_at timestamptz default now());
create table if not exists profile_history (id text primary key default gen_random_uuid()::text,user_id text references profiles(uid) on delete cascade,data jsonb,created_at timestamptz default now());
create table if not exists cover_image_history (id text primary key default gen_random_uuid()::text,user_id text references profiles(uid) on delete cascade,data jsonb,created_at timestamptz default now());

insert into storage.buckets(id,name,public) values('skyline-media','skyline-media',true) on conflict(id) do update set public=true;

-- The browser never gets the service-role key. All database access goes through skyline-api,
-- which validates the Firebase ID token before using the Supabase service role.
