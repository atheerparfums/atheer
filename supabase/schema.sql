-- ATHEER content management schema
-- Run this file once in Supabase SQL Editor before signing into /admin/.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  value text not null default '',
  label text not null default '',
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.site_assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique,
  storage_path text,
  public_url text,
  alt_text text not null default '',
  placement text not null default 'other',
  is_hidden boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  gender text not null check (gender in ('femme', 'homme')),
  image_asset_key text references public.site_assets(asset_key) on update cascade on delete set null,
  is_featured boolean not null default true,
  is_hidden boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.settings (
  setting_key text primary key,
  value text not null default '',
  label text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.site_content enable row level security;
alter table public.site_assets enable row level security;
alter table public.products enable row level security;
alter table public.settings enable row level security;

drop policy if exists "admins can read their own membership" on public.admin_users;
create policy "admins can read their own membership"
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "public can read visible content" on public.site_content;
create policy "public can read visible content"
  on public.site_content for select
  to anon, authenticated
  using (not is_hidden);

drop policy if exists "admins manage content" on public.site_content;
create policy "admins manage content"
  on public.site_content for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "public can read visible assets" on public.site_assets;
create policy "public can read visible assets"
  on public.site_assets for select
  to anon, authenticated
  using (not is_hidden);

drop policy if exists "admins manage assets" on public.site_assets;
create policy "admins manage assets"
  on public.site_assets for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "public can read visible products" on public.products;
create policy "public can read visible products"
  on public.products for select
  to anon, authenticated
  using (not is_hidden);

drop policy if exists "admins manage products" on public.products;
create policy "admins manage products"
  on public.products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins read settings" on public.settings;
create policy "admins read settings"
  on public.settings for select
  to authenticated
  using (public.is_admin());

drop policy if exists "public can read settings" on public.settings;
create policy "public can read settings"
  on public.settings for select
  to anon, authenticated
  using (true);

drop policy if exists "admins manage settings" on public.settings;
create policy "admins manage settings"
  on public.settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.site_content (content_key, value, label)
values
  ('hero_subtitle', 'أثرٌ يبقى في الهواء', 'العنوان الفرعي الرئيسي'),
  ('hero_copy', 'ليس عطراً يمرّ… بل حضورٌ يترك في المكان حكاية. نفحات عميقة مستوحاة من دفء الخشب المغربي ولمعان النحاس العتيق.', 'وصف الصفحة الرئيسية'),
  ('offer_subtitle', 'فخامة تدوم… بسعر لا يُفوت', 'وصف العرض'),
  ('product_name', 'ATHEER', 'اسم المنتج الرئيسي'),
  ('footer_copy', 'عطر فاخر بهوية مغربية أصيلة. لأن بعض الآثار لا تُرى، لكنها تبقى.', 'وصف التذييل')
on conflict (content_key) do nothing;

insert into public.settings (setting_key, value, label)
values
  ('whatsapp_number', '212661852411', 'رقم واتساب بصيغة دولية'),
  ('bundle_price', '199', 'سعر الباقة بالدرهم'),
  ('delivery_text', 'توصيل مجاني على جميع الطلبات', 'نص التوصيل'),
  ('theme_bg', '#0c0a08', 'الخلفية'),
  ('theme_surface', '#211912', 'أسطح البطاقات'),
  ('theme_text', '#f3ecdf', 'النص الرئيسي'),
  ('theme_muted', '#b9ab96', 'النص الثانوي'),
  ('theme_accent', '#b79353', 'اللون الأساسي'),
  ('theme_accent_light', '#e0c17f', 'اللون الفاتح'),
  ('theme_jade', '#5d7c67', 'اللون المساند'),
  ('theme_radius', '0px', 'استدارة الحواف')
on conflict (setting_key) do nothing;

insert into public.site_assets
  (asset_key, storage_path, public_url, alt_text, placement, sort_order)
values
  ('hero', 'assets/hero-atheer.webp', null, 'قارورة أثير على طاولة مغربية', 'hero', 1),
  ('product', 'assets/atheer-cutout.webp', null, 'قارورة عطر أثير', 'product', 2),
  ('offer', 'assets/special-offer.jpg', null, '3 عطور أثير + هدية مجانية', 'offer', 3),
  ('gallery-flatlay', 'assets/atheer-flatlay.webp', null, 'قارورة أثير محاطة بالحمضيات', 'gallery', 4),
  ('gallery-room', 'assets/atheer-moroccan-room.webp', null, 'قارورة أثير في مساحة مغربية', 'gallery', 5),
  ('gallery-lantern', 'assets/moroccan-lantern.webp', null, 'فانوس مغربي نحاسي', 'gallery', 6),
  ('gallery-zellige', 'assets/zellige-detail.webp', null, 'زليج مغربي', 'gallery', 7),
  ('gallery-hero', 'assets/hero-atheer.webp', null, 'قارورة أثير على طاولة مغربية', 'gallery', 8),
  ('gallery-gift', 'assets/atheer-gift-set.webp', null, 'مجموعة عطر أثير', 'gallery', 9),
  ('gallery-closeup', 'assets/atheer-closeup.webp', null, 'تفاصيل قارورة أثير', 'gallery', 10)
on conflict (asset_key) do nothing;

insert into public.products (code, name, gender, image_asset_key, sort_order)
values
  ('F1', 'j''adore', 'femme', 'product', 1),
  ('F2', 'Si Passione', 'femme', 'product', 2),
  ('F3', 'Alien', 'femme', 'product', 3),
  ('F4', 'Zara Femme', 'femme', 'product', 4),
  ('F5', 'Evidance', 'femme', 'product', 5),
  ('F6', 'My Way', 'femme', 'product', 6),
  ('F7', 'Chance Chanel', 'femme', 'product', 7),
  ('F8', 'La nuit tresor', 'femme', 'product', 8),
  ('F9', 'Miss Dior Chérie', 'femme', 'product', 9),
  ('F10', 'Mon Paris', 'femme', 'product', 10),
  ('H1', 'Sauvage', 'homme', 'product', 1),
  ('H2', 'Bleu de Chanel', 'homme', 'product', 2),
  ('H3', 'One Million', 'homme', 'product', 3),
  ('H4', 'Invictus', 'homme', 'product', 4),
  ('H5', 'Eros – Versace', 'homme', 'product', 5),
  ('H6', 'Lacoste Noir', 'homme', 'product', 6),
  ('H7', 'Black XS', 'homme', 'product', 7),
  ('H8', 'Hugo Boss', 'homme', 'product', 8),
  ('H9', 'La Nuit de l''Homme', 'homme', 'product', 9),
  ('H10', 'Dolce & Gabbana', 'homme', 'product', 10)
on conflict (code) do nothing;

insert into public.products (code, name, gender, image_asset_key, sort_order)
values
  ('F11', 'Amirat l3arab', 'femme', 'product', 11),
  ('F12', 'YARA', 'femme', 'product', 12),
  ('F13', 'La vie est belle', 'femme', 'product', 13),
  ('F14', 'SCANDAL', 'femme', 'product', 14),
  ('F15', 'Coco Mademoiselle', 'femme', 'product', 15),
  ('F16', 'Olympea', 'femme', 'product', 16),
  ('F17', 'Escada Taj', 'femme', 'product', 17),
  ('F18', 'Libre', 'femme', 'product', 18),
  ('F19', 'L''Interdit', 'femme', 'product', 19),
  ('F20', 'Giordani gold', 'femme', 'product', 20),
  ('F21', 'Good girl', 'femme', 'product', 21),
  ('F22', 'Because It''s You', 'femme', 'product', 22),
  ('F23', 'Light blue', 'femme', 'product', 23),
  ('F24', 'Burberry Her', 'femme', 'product', 24),
  ('F25', 'Gucci Flora', 'femme', 'product', 25),
  ('F26', 'Kayali perfume', 'femme', 'product', 26),
  ('F27', 'Dolce&Gabbana The one', 'femme', 'product', 27),
  ('F28', 'LANCOME IDOLE', 'femme', 'product', 28),
  ('F29', 'Baca rouge 540', 'femme', 'product', 29),
  ('F30', 'Goddess', 'femme', 'product', 30),
  ('F31', 'Éclat Femme', 'femme', 'product', 31),
  ('F32', 'Amber Elixir', 'femme', 'product', 32),
  ('F33', 'قمة', 'femme', 'product', 33),
  ('F34', 'Girl Of Now', 'femme', 'product', 34),
  ('F35', 'Paco Rabanne Femme', 'femme', 'product', 35),
  ('F36', 'Cristal Noir', 'femme', 'product', 36),
  ('F37', 'Black Opium', 'femme', 'product', 37),
  ('F38', 'يدرع العود', 'femme', 'product', 38),
  ('F39', 'Hypnotic Poison', 'femme', 'product', 39),
  ('F40', 'Zara Femme Gold', 'femme', 'product', 40),
  ('H11', 'Chrome – Azzaro', 'homme', 'product', 11),
  ('H12', 'Diesel Only The Brave', 'homme', 'product', 12),
  ('H13', 'Gucci Oud', 'homme', 'product', 13),
  ('H14', 'Armani Code', 'homme', 'product', 14),
  ('H15', '212 VIP Men', 'homme', 'product', 15),
  ('H16', 'Zara Homme', 'homme', 'product', 16),
  ('H17', 'Yves Saint Laurent (Y)', 'homme', 'product', 17),
  ('H18', 'Dior Fahrenheit', 'homme', 'product', 18),
  ('H19', 'Stronger With You Oud', 'homme', 'product', 19),
  ('H20', 'Stronger With You Absolutely', 'homme', 'product', 20),
  ('H21', 'Scandal Pour Homme', 'homme', 'product', 21),
  ('H22', 'Jean Paul Gaultier', 'homme', 'product', 22),
  ('H23', 'Tom Ford Black Orchid', 'homme', 'product', 23),
  ('H24', 'Wanted By Night – Azzaro', 'homme', 'product', 24),
  ('H25', 'One Million Elixir', 'homme', 'product', 25),
  ('H26', 'Tobacco Vanille – Tom Ford', 'homme', 'product', 26),
  ('H27', 'Acqua Di Gió – Giorgio Armani', 'homme', 'product', 27),
  ('H28', 'Valentino Uomo', 'homme', 'product', 28),
  ('H29', 'Prada L''Homme', 'homme', 'product', 29),
  ('H30', 'Aventus – Creed', 'homme', 'product', 30),
  ('H31', 'Just Cavalli For Men', 'homme', 'product', 31),
  ('H32', 'Boss Bottled', 'homme', 'product', 32),
  ('H33', 'CK One – Calvin Klein', 'homme', 'product', 33),
  ('H34', 'Roses Vanille – Mancera', 'homme', 'product', 34),
  ('H35', 'Stronger With You', 'homme', 'product', 35),
  ('H36', 'Invictus Victory', 'homme', 'product', 36)
on conflict (code) do nothing;

insert into storage.buckets (id, name, public)
values ('atheer-media', 'atheer-media', true)
on conflict (id) do update set public = true;

-- Keep the bucket name in one place for the admin and public site.
-- The policies below are required for uploads made with the signed-in admin session.

drop policy if exists "public can view atheer media" on storage.objects;
create policy "public can view atheer media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'atheer-media');

drop policy if exists "admins upload atheer media" on storage.objects;
create policy "admins upload atheer media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'atheer-media' and public.is_admin());

drop policy if exists "admins update atheer media" on storage.objects;
create policy "admins update atheer media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'atheer-media' and public.is_admin())
  with check (bucket_id = 'atheer-media' and public.is_admin());

drop policy if exists "admins delete atheer media" on storage.objects;
create policy "admins delete atheer media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'atheer-media' and public.is_admin());