# FileSync — A premium dark-themed file manager

A modern cloud storage UI built with Next.js, Tailwind CSS v4, Framer Motion, and Supabase.

**Live demo:** [Coming soon]

## Features

- 🔐 Google Auth via Supabase
- 📤 Drag & drop file uploads (with 50MB limit)
- 🖼️ Image & PDF preview modal
- 🔍 Real-time file search
- 🏷️ File type breakdown with colored chips
- 📊 Storage analytics dashboard
- 🎨 Grid / List view toggle
- 🔄 Animated progress bars & microinteractions
- 🗂️ Category navigation (Images, Videos, Docs, etc.)
- 🚨 Storage warning when >80% full
- ✨ Framer Motion animations throughout

## Tech Stack

| What | Why |
|------|-----|
| **Next.js 14** | App Router, React 18 |
| **Tailwind CSS v4** | Utility-first styling with `@theme` tokens |
| **Framer Motion** | Spring animations, layout transitions |
| **Supabase** | Auth + Storage backend |
| **Lucide React** | Icon library |
| **Geist Font** | System font by Vercel |

## Getting Started

```bash
git clone https://github.com/Phiraien/filesync-app
cd filesync-app
cp .env.local.example .env.local   # Add your Supabase keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable **Google Auth** in Authentication → Providers
3. Create a storage bucket called `my-files` (public)
4. Add `http://localhost:3000` to **Authentication → URL Configuration → Redirect URLs**
5. Copy your project URL and anon key to `.env.local`

### Database (Row Level Security)

Run the SQL in `supabase-rls-policies.sql` in your Supabase SQL Editor to lock storage behind user authentication. This ensures users can only see and delete their own files.

## Project Structure

```
src/
├── app/
│   ├── globals.css       # Tailwind v4 import + custom theme tokens
│   ├── layout.tsx        # Root layout (Geist font, CSS import)
│   └── page.tsx          # Entry → renders AppShell
├── components/
│   └── AppShell.tsx      # The entire app in one file
└── lib/
    └── supabase.ts       # Supabase client singleton
```

## Design

Dark theme inspired by Linear, Arc Browser, and Vercel Dashboard.

- **Background:** `#09090B`
- **Surfaces:** `#111118` with subtle glassmorphism
- **Accent:** `#8B5CF6` (Violet)
- **Borders:** `#27272F`
- **Text:** `#FAFAFA` / `#A1A1AA`

Ambient radial gradient glows in the background. Everything at 200–300ms with spring easing.

## License

MIT
