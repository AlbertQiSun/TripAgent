#!/usr/bin/env bash
set -e

echo "============================================"
echo "  TripAI — Full Setup Script"
echo "============================================"
echo ""

# ── Check prerequisites ─────────────────────────────────────
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 is required. Install from https://python.org"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required. Install Node.js from https://nodejs.org"; exit 1; }

echo "✓ Python $(python3 --version | cut -d' ' -f2)"
echo "✓ Node $(node --version)"
echo "✓ npm $(npm --version)"
echo ""

# ── Backend Setup ────────────────────────────────────────────
echo "── Setting up Backend ──────────────────────"
cd backend

# Create virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Installing Python dependencies..."
pip install -r requirements.txt --quiet

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  No .env file found. Creating template..."
    cat > .env << 'EOF'
# Required: Get your API key from https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key_here

# Optional: Override the default model
# GEMINI_MODEL=gemini-2.5-flash
EOF
    echo "📝 Created backend/.env — Please add your GOOGLE_API_KEY before running!"
    NEEDS_KEY=true
else
    echo "✓ .env file exists"
fi

cd ..

# ── Frontend Setup ───────────────────────────────────────────
echo ""
echo "── Setting up Frontend ─────────────────────"
cd frontend

echo "Installing Node.js dependencies..."
npm install --silent 2>/dev/null

cd ..

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  ✅ Setup Complete!"
echo "============================================"
echo ""
echo "To run the app:"
echo ""
echo "  1. Add your API key to backend/.env:"
echo "     GOOGLE_API_KEY=your_key_here"
echo ""
echo "  2. Start the backend:"
echo "     cd backend && source .venv/bin/activate"
echo "     uvicorn main:app --host 0.0.0.0 --port 8000"
echo ""
echo "  3. Start the frontend (new terminal):"
echo "     cd frontend && npm run dev"
echo ""
echo "  4. Open http://localhost:3000"
echo ""

if [ "${NEEDS_KEY}" = true ]; then
    echo "⚠️  IMPORTANT: Set your GOOGLE_API_KEY in backend/.env first!"
fi
