# DocuMind — AI Document Intelligence

Chat with your documents using AI. Upload any PDF, Word, or text file and ask questions in plain English.

## Features
- Upload PDF, DOCX, TXT files
- Ask questions in natural language
- Get answers with exact source citations
- Conversation history
- Powered by Google Gemini + ChromaDB RAG

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
# Add your Gemini API key to .env
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Tech Stack
React.js, FastAPI, Python, Google Gemini API, ChromaDB, Sentence Transformers, PyMuPDF, Vercel, Railway
