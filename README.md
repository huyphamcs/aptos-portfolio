# 🚀 Aptos Explorer

A modern, beautiful Aptos blockchain account explorer built with Next.js, featuring a Web3-grade UI with glassmorphism effects and interactive exploration capabilities.

![Aptos Explorer](https://img.shields.io/badge/Blockchain-Aptos-blue) ![Next.js](https://img.shields.io/badge/Framework-Next.js-black) ![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue) ![Tailwind](https://img.shields.io/badge/Styling-Tailwind-cyan)

## ✨ Features

### 🔍 **Account Exploration**
- **Real-time Account Data**: Fetch comprehensive account information using Aptos SDK
- **Dynamic Address Input**: Search any Aptos address with instant validation
- **Account Overview**: Beautiful cards showing APT balance, transaction count, assets, and NFTs

### 💰 **Assets Portfolio**
- **Token Holdings**: Display all tokens with non-zero balances
- **Asset Details**: Show token names, symbols, amounts, and addresses
- **Explorer Integration**: Click any asset to view details on official Aptos Explorer
- **Copy Functionality**: One-click copy for asset addresses

### 🎨 **NFT Collection**
- **Visual NFT Gallery**: Beautiful grid layout with image previews
- **NFT Metadata**: Display names, collections, and fallback for missing images
- **Explorer Links**: Click any NFT to view detailed token information

### 📊 **Transaction History**
- **Hybrid API Approach**: GraphQL for speed, REST API for large datasets
- **Pagination**: Load thousands of transactions efficiently
- **Transaction Details**: Version, type, direction (send/receive)
- **Explorer Integration**: Click any transaction for detailed information

### 🎨 **Modern Web3 UI**
- **Glassmorphism Design**: Backdrop blur effects and transparency
- **Gradient Animations**: Dynamic color transitions and hover effects
- **Responsive Layout**: Perfect on desktop, tablet, and mobile
- **Dark Theme**: Optimized for blockchain applications

## 🚀 Quick Start

```bash
# Clone the repository
git clone <your-repo-url>
cd aptos-explorer

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🌐 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/aptos-explorer)

### 📋 Step-by-Step Deployment:

1. **✅ Push to GitHub** (already done!)
2. **🌐 Go to [vercel.com](https://vercel.com)** and sign in with your GitHub account
3. **➕ Click "New Project"** and import your repository
4. **⚙️ Verify Settings**:
   - Framework: **Next.js** (auto-detected)
   - Build Command: **`npm run build`**
   - Output Directory: **`.next`**
   - Install Command: **`npm install`**
5. **🚀 Click "Deploy"** and wait for the magic!
6. **🎉 Your app will be live** at `https://your-app-name.vercel.app`

### 🔧 Optional Environment Variables

Add these in the Vercel dashboard → Settings → Environment Variables:

```env
NEXT_PUBLIC_APTOS_NETWORK=testnet
NEXT_PUBLIC_APTOS_GRAPHQL_URL=https://api.testnet.aptoslabs.com/v1/graphql
```

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 with React 19
- **Styling**: Tailwind CSS 4 with custom glassmorphism
- **Blockchain**: Aptos Labs TypeScript SDK
- **Data**: Apollo Client GraphQL + REST API fallback
- **Deployment**: Optimized for Vercel

## 📚 References

- [Aptos TypeScript SDK Documentation](https://github.com/aptos-labs/aptos-ts-sdk/blob/main/src/api/account.ts)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)

---

**🌟 Ready to explore the Aptos blockchain? Deploy now and share your live URL!**
