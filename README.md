# ToneManager PRO

ToneManager PRO is a modern, high-performance web application designed to streamline the discovery and management of **Neural Amp Modeler (NAM)** captures. It connects directly to the Tone3000 API, allowing guitarists and producers to browse, search, and instantly sync thousands of community-made rigs, amps, and pedals directly to their local machines.

## ✨ Key Features

- **Direct Local Sync (File System Access API)**: Say goodbye to manually downloading and extracting ZIP files. ToneManager requests secure permission to your local `NAM_Profiles` folder and writes the `.nam` models directly to your hard drive.
- **Smart Architecture Filtering**: The NAM ecosystem includes legacy formats (A1 / WaveNet) and modern formats (A2 / SlimmableContainer). ToneManager automatically detects, filters, and downloads the correct architecture based on your preference to ensure plugin compatibility.
- **Automated Categorization**: Downloads are automatically organized into clean, structured subdirectories (e.g., `FullRig`, `Amps`, `Pedals`, `Outboard`) based on the model's metadata.
- **Deduplication Engine**: Intelligently handles identically-named models across different versions within the same pack, ensuring your folders remain clean and clash-free.
- **Parallel Downloading**: Queue multiple downloads simultaneously with a non-blocking UI and real-time Toast notifications for immediate feedback.
- **Cloud Accounts**: Secure authentication system to keep track of your downloaded history and favorite models across any device.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Frontend**: React, TypeScript, Vanilla CSS for tailored styling
- **Database**: PostgreSQL (via Supabase / Prisma)
- **Icons**: Lucide React
- **Authentication**: Custom JWT-based cookie authentication

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- A PostgreSQL database connection string (e.g., from Supabase)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/tone-manager.git
cd tone-manager
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables by creating a `.env` file:
```env
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="your-secure-jwt-secret-key"
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

*Note: For the Direct Local Sync feature to work, the application must be running in a Secure Context (`localhost` or `https://`) and accessed via a Chromium-based browser (Chrome, Edge, Brave, Opera).*

## 🌍 Deployment

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

1. Push your code to a GitHub repository.
2. Import the project into Vercel.
3. Add your `DATABASE_URL` and `JWT_SECRET` to the Vercel Environment Variables.
4. Deploy! Vercel automatically provides the HTTPS certificate required for the File System Access API.
